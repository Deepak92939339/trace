-- P3: payment milestone schedule (when payment is due) on quotations.
-- A quote without a schedule is sealed exactly as before (snapshot format v1, same
-- bytes). A quote with a schedule is sealed as format v2 = v1 + payment_schedule.
-- The calculation document, calculation_format_version and fingerprint are unchanged.
-- Browser roles get no new executable routine (existing tests 15 and 18): reads are
-- a table select, writes go through an updatable view with an INSTEAD OF trigger.
begin;

create type public.quote_payment_trigger as enum (
  'on_acceptance', 'on_delivery', 'on_completion', 'on_date'
);

create table public.quote_payment_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  position smallint not null check (position between 1 and 12),
  label text not null check (
    char_length(label) between 1 and 120
    and label = btrim(label)
    and label !~ '[[:cntrl:]]'
    and label !~* '\m(paid|received|pending|outstanding|overdue|settled)\M'
  ),
  basis_points integer not null check (basis_points between 1 and 10000),
  payment_trigger public.quote_payment_trigger not null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, position),
  foreign key (organization_id, quote_id)
    references public.quotes(organization_id, id) on delete cascade,
  check ((payment_trigger = 'on_date') = (due_date is not null))
);
create index quote_payment_milestones_quote_idx
  on public.quote_payment_milestones (organization_id, quote_id, position);

alter table public.quote_payment_milestones enable row level security;
create policy quote_payment_milestones_select_member on public.quote_payment_milestones
  for select to authenticated
  using (public.has_org_capability(organization_id, 'quote.read'));
revoke all on public.quote_payment_milestones from public, anon, authenticated;
grant select on public.quote_payment_milestones to authenticated;

-- Amounts: round-half-up for every milestone but the last (the kernel rule); the
-- last absorbs the remainder so the sum equals the total exactly.
create or replace function public.quote_milestone_amounts(
  p_total bigint,
  p_basis_points integer[]
)
returns bigint[]
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_count integer := coalesce(cardinality(p_basis_points), 0);
  v_sum bigint := 0;
  v_allocated numeric := 0;
  v_amount numeric;
  v_amounts bigint[] := '{}';
  v_index integer;
begin
  if p_total is null or p_total <= 0 or v_count < 1 or v_count > 12 then
    raise exception using errcode = '22023', message = 'PAYMENT_SCHEDULE_INVALID';
  end if;
  for v_index in 1 .. v_count loop
    if p_basis_points[v_index] is null or p_basis_points[v_index] < 1 or p_basis_points[v_index] > 10000 then
      raise exception using errcode = '22023', message = 'PAYMENT_SCHEDULE_INVALID';
    end if;
    v_sum := v_sum + p_basis_points[v_index];
  end loop;
  if v_sum <> 10000 then
    raise exception using errcode = '22023', message = 'PAYMENT_SCHEDULE_INVALID';
  end if;
  for v_index in 1 .. v_count - 1 loop
    v_amount := floor((p_total::numeric * p_basis_points[v_index] + 5000) / 10000);
    v_amounts := array_append(v_amounts, v_amount::bigint);
    v_allocated := v_allocated + v_amount;
  end loop;
  v_amount := p_total::numeric - v_allocated;
  if v_amount < 0 then
    raise exception using errcode = '22023', message = 'PAYMENT_SCHEDULE_INVALID';
  end if;
  return array_append(v_amounts, v_amount::bigint);
end;
$$;

-- Format v2 snapshot = the unchanged v1 snapshot plus the sealed schedule.
create or replace function public.quote_snapshot_v2(
  p_revision_id uuid,
  p_calculation_fingerprint text,
  p_threshold_bps integer,
  p_requires_manual boolean,
  p_reason_codes text[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.quote_snapshot_v1(
      p_revision_id, p_calculation_fingerprint, p_threshold_bps, p_requires_manual, p_reason_codes
    ) || jsonb_build_object(
      'format_version', 2,
      'payment_schedule', (
        select jsonb_agg(jsonb_build_object(
          'position', milestone.position,
          'label', milestone.label,
          'basis_points', milestone.basis_points,
          'trigger', milestone.payment_trigger::text,
          'due_date', milestone.due_date::text,
          'amount_minor', amounts.values[milestone.position]
        ) order by milestone.position)
        from public.quote_payment_milestones milestone
        cross join lateral (
          select public.quote_milestone_amounts(quote.total_minor, (
            select array_agg(inner_milestone.basis_points order by inner_milestone.position)
            from public.quote_payment_milestones inner_milestone
            where inner_milestone.organization_id = quote.organization_id
              and inner_milestone.quote_id = quote.id)) as values
        ) amounts
        where milestone.organization_id = quote.organization_id and milestone.quote_id = quote.id
      )
    )
  from public.quote_revisions revision
  join public.quotes quote
    on quote.organization_id = revision.organization_id and quote.id = revision.quote_id
  where revision.id = p_revision_id;
$$;

-- Edit path (draft only, quote.edit): replace the whole schedule atomically. The
-- caller filters on the quote version they read, and the quote version is bumped once.
create view public.quote_payment_schedule_editor
with (security_barrier = true) as
select
  quote.id as quote_id,
  quote.version,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'label', milestone.label,
      'basis_points', milestone.basis_points,
      'trigger', milestone.payment_trigger::text,
      'due_date', milestone.due_date::text
    ) order by milestone.position)
    from public.quote_payment_milestones milestone
    where milestone.organization_id = quote.organization_id and milestone.quote_id = quote.id
  ), '[]'::jsonb) as milestones
from public.quotes quote
where quote.state = 'draft'
  and public.has_org_capability(quote.organization_id, 'quote.edit')
  and public.has_org_capability(quote.organization_id, 'quote.read');

create or replace function public.write_quote_payment_schedule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_entry jsonb;
  v_position integer := 0;
  v_total integer := 0;
  v_label text;
  v_bps integer;
  v_trigger public.quote_payment_trigger;
  v_due date;
  v_actor jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  select * into v_quote from public.quotes where id = old.quote_id for update;
  if v_quote.id is null or not public.has_org_capability(v_quote.organization_id, 'quote.edit') then
    raise exception using errcode = '42501', message = 'quote_edit_forbidden';
  end if;
  if v_quote.state <> 'draft' then
    raise exception using errcode = '55000', message = 'quote_not_draft';
  end if;
  if v_quote.version <> old.version then
    raise exception using errcode = 'P0001', message = 'quote_version_stale';
  end if;
  if new.milestones is null or jsonb_typeof(new.milestones) <> 'array'
    or jsonb_array_length(new.milestones) > 12 then
    raise exception using errcode = '22023', message = 'payment_schedule_invalid';
  end if;

  delete from public.quote_payment_milestones
  where organization_id = v_quote.organization_id and quote_id = v_quote.id;
  for v_entry in select value from jsonb_array_elements(new.milestones) loop
    v_position := v_position + 1;
    if jsonb_typeof(v_entry) <> 'object'
      or exists (select 1 from jsonb_object_keys(v_entry) key
        where key not in ('label', 'basis_points', 'trigger', 'due_date'))
      or not (v_entry ?& array['label', 'basis_points', 'trigger', 'due_date'])
      or jsonb_typeof(v_entry -> 'label') <> 'string'
      or jsonb_typeof(v_entry -> 'basis_points') <> 'number'
      or jsonb_typeof(v_entry -> 'trigger') <> 'string'
      or jsonb_typeof(v_entry -> 'due_date') not in ('string', 'null') then
      raise exception using errcode = '22023', message = 'payment_schedule_invalid';
    end if;
    v_label := btrim(v_entry ->> 'label');
    if (v_entry ->> 'basis_points') !~ '^[0-9]{1,5}$' then
      raise exception using errcode = '22023', message = 'payment_schedule_invalid';
    end if;
    v_bps := (v_entry ->> 'basis_points')::integer;
    if v_entry ->> 'trigger' not in ('on_acceptance', 'on_delivery', 'on_completion', 'on_date') then
      raise exception using errcode = '22023', message = 'payment_schedule_invalid';
    end if;
    v_trigger := (v_entry ->> 'trigger')::public.quote_payment_trigger;
    if v_trigger = 'on_date' then
      if coalesce(v_entry ->> 'due_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception using errcode = '22023', message = 'payment_schedule_invalid';
      end if;
      v_due := (v_entry ->> 'due_date')::date;
      if v_due < v_quote.issue_date then
        raise exception using errcode = '22023', message = 'payment_schedule_invalid';
      end if;
    elsif jsonb_typeof(v_entry -> 'due_date') <> 'null' then
      raise exception using errcode = '22023', message = 'payment_schedule_invalid';
    else
      v_due := null;
    end if;
    v_total := v_total + v_bps;
    if v_total > 10000 then
      raise exception using errcode = '22023', message = 'payment_schedule_invalid';
    end if;
    -- Label, bounds and the status-word rule are also enforced by table checks (23514).
    insert into public.quote_payment_milestones (
      organization_id, quote_id, position, label, basis_points, payment_trigger, due_date
    ) values (v_quote.organization_id, v_quote.id, v_position, v_label, v_bps, v_trigger, v_due);
  end loop;

  update public.quotes set version = version + 1 where id = v_quote.id;
  v_actor := public.quote_actor(v_quote.organization_id);
  insert into public.quote_activity (
    organization_id, quote_id, event_type, actor_user_id, actor_name_snapshot,
    actor_role_snapshot, actor_source, message
  ) values (
    v_quote.organization_id, v_quote.id, 'draft.payment_schedule_updated', auth.uid(),
    v_actor ->> 'name', v_actor ->> 'role', 'signed_user', 'Payment schedule updated.'
  );
  new.version := v_quote.version + 1;
  return new;
end;
$$;

create trigger quote_payment_schedule_editor_write
instead of update on public.quote_payment_schedule_editor
for each row execute function public.write_quote_payment_schedule();

revoke all on function
  public.quote_milestone_amounts(bigint, integer[]),
  public.quote_snapshot_v2(uuid, text, integer, boolean, text[]),
  public.write_quote_payment_schedule()
from public, anon, authenticated;
revoke all on public.quote_payment_schedule_editor from public, anon, authenticated;
grant select on public.quote_payment_schedule_editor to authenticated;
grant update (milestones) on public.quote_payment_schedule_editor to authenticated;

-- Snapshot format 2 is allowed next to format 1 (calculation format stays 1).
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass::text as relation, conname, pg_get_constraintdef(oid) as definition
    from pg_catalog.pg_constraint
    where contype = 'c'
      and conrelid in ('public.quote_revisions'::regclass, 'public.quote_acceptances'::regclass)
      and pg_get_constraintdef(oid) like '%snapshot_format_version = 1%'
  loop
    execute format('alter table %s drop constraint %I', c.relation, c.conname);
    execute format('alter table %s add constraint %I %s', c.relation, c.conname,
      replace(c.definition, 'snapshot_format_version = 1',
        'snapshot_format_version = ANY (ARRAY[1, 2])'));
  end loop;
end;
$$;

alter table public.quote_revisions
  add constraint quote_revisions_snapshot_format_matches
    check (snapshot is null or snapshot_format_version = (snapshot ->> 'format_version')::integer),
  add constraint quote_revisions_payment_schedule_matches
    check (snapshot_format_version is null
      or ((snapshot_format_version = 2) = (snapshot ? 'payment_schedule')));

-- Successor revisions (verbatim copy of 20260814110000_s1_revision_commands.sql,
-- plus restoring the sealed schedule of the base revision).
create or replace function public.begin_quote_revision(
  p_quote_id uuid,
  p_base_revision_id uuid,
  p_expected_version integer,
  p_command_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  quote_row public.quotes%rowtype;
  base public.quote_revisions%rowtype;
  request jsonb := jsonb_build_object('quote_id', p_quote_id, 'base_revision_id', p_base_revision_id, 'expected_version', p_expected_version);
  replay jsonb;
  revision_id uuid;
  next_number integer;
  result jsonb;
begin
  if caller is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_command_id is null then raise exception using errcode = '22023', message = 'command_id_required'; end if;
  select * into quote_row from public.quotes where id = p_quote_id for update;
  if quote_row.id is null or not public.has_org_capability(quote_row.organization_id, 'quote.revise') then
    raise exception using errcode = '42501', message = 'quote_revise_forbidden';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('organization:' || quote_row.organization_id::text || ':' || p_command_id::text, 0));
  replay := public.command_receipt_replay('organization', quote_row.organization_id, p_command_id,
    'quote.begin_revision', 'quote', p_quote_id, request);
  if replay is not null then return replay; end if;
  if quote_row.version <> p_expected_version then raise exception using errcode = '40001', message = 'quote_version_stale'; end if;
  if quote_row.accepted_revision_id is not null then raise exception using errcode = '55000', message = 'quote_already_accepted'; end if;
  select * into base from public.quote_revisions where organization_id = quote_row.organization_id
    and quote_id = quote_row.id and id = p_base_revision_id for share;
  if base.id is null or quote_row.current_revision_id <> base.id or base.record_kind <> 'verified_revision'
    or not (
      base.state in ('issued', 'rejected')
      or public.quote_effective_state(
        base.state,
        base.valid_until,
        (select organization.timezone from public.organizations organization where organization.id = quote_row.organization_id),
        statement_timestamp()
      ) = 'expired'
    ) then
    raise exception using errcode = '55000', message = 'base_revision_not_revisable';
  end if;
  next_number := quote_row.revision_counter + 1;
  insert into public.quote_revisions (organization_id, quote_id, revision_number, record_kind,
    state, parent_revision_id, source_quote_version, created_by)
  values (quote_row.organization_id, quote_row.id, next_number, 'verified_revision', 'draft',
    base.id, quote_row.version + 1, caller) returning id into revision_id;

  delete from public.quote_items where organization_id = quote_row.organization_id and quote_id = quote_row.id;
  delete from public.quote_charges where organization_id = quote_row.organization_id and quote_id = quote_row.id;
  delete from public.quote_payment_milestones where organization_id = quote_row.organization_id and quote_id = quote_row.id;
  insert into public.quote_items (id, organization_id, quote_id, product_id, position, sku_snapshot,
    description_snapshot, unit_code_snapshot, quantity_precision_snapshot, unit_price_minor_snapshot,
    currency_code, quantity_scaled, quantity_scale, tax_code_snapshot, tax_bps_snapshot,
    tax_price_basis_snapshot, tax_treatment_snapshot, base_minor, discount_minor, net_minor, tax_minor, line_total_minor)
  select (entry->>'id')::uuid, quote_row.organization_id, quote_row.id, (entry->>'product_id')::uuid,
    (entry->>'position')::integer, entry->>'sku', entry->>'description', (entry->>'unit_code')::public.unit_code,
    (entry->>'quantity_precision')::integer, (entry->>'unit_price_minor')::bigint, entry->>'currency_code',
    (entry->>'quantity_scaled')::bigint, (entry->>'quantity_scale')::bigint, entry->>'tax_code',
    (entry->>'tax_bps')::integer, (entry->>'tax_price_basis')::public.tax_price_basis,
    (entry->>'tax_treatment')::public.tax_treatment, (entry->>'base_minor')::bigint,
    (entry->>'discount_minor')::bigint, (entry->>'net_minor')::bigint,
    (entry->>'tax_minor')::bigint, (entry->>'line_total_minor')::bigint
  from jsonb_array_elements(base.snapshot->'items') entry;
  insert into public.quote_charges (id, organization_id, quote_id, position, charge_type,
    description_snapshot, amount_minor, currency_code, tax_code_snapshot, tax_bps_snapshot,
    tax_price_basis_snapshot, tax_treatment_snapshot, discount_applies, discount_minor,
    net_minor, tax_minor, charge_total_minor)
  select (entry->>'id')::uuid, quote_row.organization_id, quote_row.id, (entry->>'position')::integer,
    (entry->>'charge_type')::public.quote_charge_type, entry->>'description', (entry->>'amount_minor')::bigint,
    entry->>'currency_code', entry->>'tax_code', (entry->>'tax_bps')::integer,
    (entry->>'tax_price_basis')::public.tax_price_basis, (entry->>'tax_treatment')::public.tax_treatment,
    (entry->>'discount_applies')::boolean, (entry->>'discount_minor')::bigint,
    (entry->>'net_minor')::bigint, (entry->>'tax_minor')::bigint, (entry->>'total_minor')::bigint
  from jsonb_array_elements(base.snapshot->'charges') entry;
  insert into public.quote_payment_milestones (organization_id, quote_id, position, label,
    basis_points, payment_trigger, due_date)
  select quote_row.organization_id, quote_row.id, (entry->>'position')::smallint, entry->>'label',
    (entry->>'basis_points')::integer, (entry->>'trigger')::public.quote_payment_trigger,
    (entry->>'due_date')::date
  from jsonb_array_elements(coalesce(base.snapshot->'payment_schedule', '[]'::jsonb)) entry;
  update public.quotes set
    customer_id = (base.snapshot#>>'{buyer,customer_id}')::uuid,
    currency_code = base.snapshot#>>'{commercial,currency_code}', locale = base.snapshot#>>'{commercial,locale}',
    tax_label = base.snapshot#>>'{commercial,tax_label}', tax_mode = (base.snapshot#>>'{commercial,tax_mode}')::public.tax_price_basis,
    customer_tax_treatment = (base.snapshot#>>'{commercial,customer_tax_treatment}')::public.tax_treatment,
    discount_bps = (base.snapshot#>>'{commercial,discount_bps}')::integer,
    issue_date = (base.snapshot#>>'{commercial,issue_date}')::date,
    valid_until = (base.snapshot#>>'{commercial,valid_until}')::date, notes = base.snapshot#>>'{commercial,notes}',
    subtotal_minor = (base.snapshot#>>'{totals,subtotal_minor}')::bigint,
    discount_minor = (base.snapshot#>>'{totals,discount_minor}')::bigint,
    item_tax_minor = (base.snapshot#>>'{totals,item_tax_minor}')::bigint,
    charge_net_minor = (base.snapshot#>>'{totals,charge_net_minor}')::bigint,
    charge_tax_minor = (base.snapshot#>>'{totals,charge_tax_minor}')::bigint,
    total_minor = (base.snapshot#>>'{totals,total_minor}')::bigint,
    state = 'draft', version = version + 1, current_revision_id = revision_id,
    revision_counter = next_number, submitted_by = null, submitted_at = null,
    approved_by = null, approved_at = null, rejected_by = null, rejected_at = null,
    rejected_reason = null, issued_by = null, issued_at = null
  where id = quote_row.id;
  update public.quotes set
    seller_legal_name_snapshot = null, seller_address_line1_snapshot = null,
    seller_address_line2_snapshot = null, seller_city_snapshot = null,
    seller_region_snapshot = null, seller_postal_code_snapshot = null,
    seller_country_code_snapshot = null, seller_tax_identifier_snapshot = null,
    seller_contact_email_snapshot = null, seller_contact_phone_snapshot = null
  where id = quote_row.id;
  update public.quote_share_links set disabled_at = now(), disabled_reason = 'superseded'
  where organization_id = quote_row.organization_id and quote_id = quote_row.id and disabled_at is null;
  result := jsonb_build_object('id', quote_row.id, 'number', quote_row.number, 'state', 'draft',
    'version', quote_row.version + 1, 'current_revision_id', revision_id, 'revision_number', next_number);
  perform public.set_command_receipt_context('organization', quote_row.organization_id, p_command_id, request);
  insert into public.command_receipts (organization_id, command_id, command_type, aggregate_type, aggregate_id, actor_user_id, result)
  values (quote_row.organization_id, gen_random_uuid(), 'quote.begin_revision', 'quote', quote_row.id, caller, result);
  return result;
end;
$$;

-- Submit (verbatim copy of 20260901090000_p1_cost_and_margin_floor.sql, plus the
-- schedule validation, the v1/v2 snapshot choice and snapshot_format_version).
create or replace function public.execute_quote_revision_command(
  p_action text,
  p_quote_id uuid,
  p_revision_id uuid,
  p_expected_version integer,
  p_command_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  quote_row public.quotes%rowtype;
  revision public.quote_revisions%rowtype;
  organization public.organizations%rowtype;
  customer public.customers%rowtype;
  capability text;
  request jsonb;
  replay jsonb;
  v_calculation_document jsonb;
  v_calculation_bytes bytea;
  v_calculation_fingerprint text;
  v_snapshot_document jsonb;
  v_snapshot_bytes bytea;
  v_issued_seller jsonb;
  reasons text[] := '{}'::text[];
  requires_manual boolean;
  next_state public.quote_state;
  result jsonb;
  actor jsonb;
  v_margin record;
  v_public_reasons text[];
  v_format smallint := 1;
begin
  if caller is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_command_id is null then raise exception using errcode = '22023', message = 'command_id_required'; end if;
  if p_action not in ('submit', 'approve', 'reject', 'issue') then raise exception using errcode = '22023', message = 'revision_action_invalid'; end if;
  select * into quote_row from public.quotes where id = p_quote_id for update;
  capability := 'quote.' || p_action;
  if quote_row.id is null or not public.has_org_capability(quote_row.organization_id, capability) then
    raise exception using errcode = '42501', message = 'quote_' || p_action || '_forbidden';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('organization:' || quote_row.organization_id::text || ':' || p_command_id::text, 0));
  request := jsonb_build_object('action', p_action, 'quote_id', p_quote_id, 'revision_id', p_revision_id, 'expected_version', p_expected_version,
    'reason', case when p_action = 'reject' then btrim(coalesce(p_reason, '')) else null end);
  replay := public.command_receipt_replay('organization', quote_row.organization_id, p_command_id,
    'quote.revision_' || p_action, 'quote_revision', p_revision_id, request);
  if replay is not null then return replay; end if;
  if quote_row.version <> p_expected_version then raise exception using errcode = '40001', message = 'quote_version_stale'; end if;
  if quote_row.current_revision_id <> p_revision_id then raise exception using errcode = '40001', message = 'revision_stale'; end if;
  select * into revision from public.quote_revisions where organization_id = quote_row.organization_id
    and quote_id = quote_row.id and id = p_revision_id for update;
  if revision.id is null or revision.record_kind <> 'verified_revision' then raise exception using errcode = '55000', message = 'verified_revision_required'; end if;
  select * into organization from public.organizations where id = quote_row.organization_id for share;

  if p_action = 'submit' then
    if revision.state <> 'draft' or quote_row.state <> 'draft' then raise exception using errcode = '55000', message = 'revision_not_draft'; end if;
    if quote_row.valid_until < public.organization_local_date(quote_row.organization_id, statement_timestamp()) then
      raise exception using errcode = '22023', message = 'QUOTE_EXPIRED';
    end if;
    if not exists (select 1 from public.quote_items where organization_id = quote_row.organization_id and quote_id = quote_row.id) then
      raise exception using errcode = '55000', message = 'quote_requires_item';
    end if;
    if nullif(btrim(organization.seller_legal_name), '') is null
      or nullif(btrim(organization.seller_address_line1), '') is null
      or nullif(btrim(organization.seller_city), '') is null
      or nullif(btrim(organization.seller_country_code), '') is null then
      raise exception using errcode = '55000', message = 'SELLER_PROFILE_INCOMPLETE';
    end if;
    select * into customer from public.customers where organization_id = quote_row.organization_id and id = quote_row.customer_id for share;
    perform public.recalculate_quote(quote_row.organization_id, quote_row.id);
    select * into quote_row from public.quotes where id = p_quote_id;
    if exists (select 1 from public.quote_payment_milestones milestone
      where milestone.organization_id = quote_row.organization_id and milestone.quote_id = quote_row.id) then
      -- Raises PAYMENT_SCHEDULE_INVALID unless the basis points total 10000, the total is positive
      -- and the last amount is not negative; a dated milestone may not precede the issue date.
      perform public.quote_milestone_amounts(quote_row.total_minor, (
        select array_agg(milestone.basis_points order by milestone.position)
        from public.quote_payment_milestones milestone
        where milestone.organization_id = quote_row.organization_id and milestone.quote_id = quote_row.id));
      if exists (select 1 from public.quote_payment_milestones milestone
        where milestone.organization_id = quote_row.organization_id and milestone.quote_id = quote_row.id
          and milestone.due_date < quote_row.issue_date) then
        raise exception using errcode = '22023', message = 'PAYMENT_SCHEDULE_INVALID';
      end if;
      v_format := 2;
    end if;
    if revision.parent_revision_id is not null then reasons := array_append(reasons, 'successor_revision'); end if;
    if revision.legacy_source_revision_id is not null then reasons := array_append(reasons, 'legacy_adoption'); end if;
    if quote_row.discount_bps > organization.approval_threshold_bps then reasons := array_append(reasons, 'discount_above_threshold'); end if;
    select * into v_margin from public.quote_margin_calc where quote_id = quote_row.id;
    if v_margin.below_cost then reasons := array_append(reasons, 'below_cost'); end if;
    if v_margin.under_floor then reasons := array_append(reasons, 'margin_under_floor'); end if;
    select coalesce(array_agg(reason order by convert_to(reason, 'UTF8')), '{}') into reasons from unnest(reasons) reason;
    requires_manual := cardinality(reasons) > 0;
    v_public_reasons := array_remove(array_remove(reasons, 'below_cost'), 'margin_under_floor');
    next_state := case when requires_manual then 'waiting'::public.quote_state else 'approved'::public.quote_state end;
    v_calculation_document := public.quote_calculation_document_v1(quote_row.id);
    v_calculation_bytes := public.canonical_json_v1(v_calculation_document);
    v_calculation_fingerprint := public.sha256_hex(v_calculation_bytes);
    v_snapshot_document := case when v_format = 2
      then public.quote_snapshot_v2(revision.id, v_calculation_fingerprint,
        organization.approval_threshold_bps, requires_manual, v_public_reasons)
      else public.quote_snapshot_v1(revision.id, v_calculation_fingerprint,
        organization.approval_threshold_bps, requires_manual, v_public_reasons) end;
    v_snapshot_bytes := public.canonical_json_v1(v_snapshot_document);
    update public.quote_revisions set state = next_state, snapshot_format_version = v_format,
      calculation_format_version = 1, snapshot = v_snapshot_document, canonical_snapshot = v_snapshot_bytes,
      calculation_document = v_calculation_document, canonical_calculation = v_calculation_bytes,
      calculation_fingerprint = v_calculation_fingerprint, calculation_hash = v_calculation_fingerprint,
      snapshot_hash = public.sha256_hex(v_snapshot_bytes), currency_code = quote_row.currency_code,
      total_minor = quote_row.total_minor, valid_until = quote_row.valid_until,
      approval_threshold_bps = organization.approval_threshold_bps,
      requires_manual_approval = requires_manual, approval_reason_codes = reasons,
      margin_bps = v_margin.margin_bps, margin_floor_bps = v_margin.floor_bps,
      lines_without_cost = v_margin.lines_without_cost,
      submitted_by = caller, submitted_at = now(), approved_by = null,
      approved_at = case when next_state = 'approved' then now() else null end
    where id = revision.id;
    update public.quotes set state = next_state, version = version + 1, submitted_by = caller, submitted_at = now(),
      approved_by = null,
      approved_at = case when next_state = 'approved' then now() else null end,
      customer_name_snapshot = customer.name, contact_name_snapshot = customer.contact_name,
      email_snapshot = customer.email, billing_address_line1_snapshot = customer.billing_address_line1,
      billing_address_line2_snapshot = customer.billing_address_line2, billing_city_snapshot = customer.billing_city,
      billing_region_snapshot = customer.billing_region, billing_postal_code_snapshot = customer.billing_postal_code,
      billing_country_code_snapshot = customer.billing_country_code, tax_identifier_snapshot = customer.tax_identifier,
      approval_threshold_bps_snapshot = organization.approval_threshold_bps
    where id = quote_row.id;
    if next_state = 'approved' then
      insert into public.quote_activity (organization_id, quote_id, event_type, actor_user_id,
        actor_name_snapshot, actor_role_snapshot, actor_source, message, safe_metadata)
      values (quote_row.organization_id, quote_row.id, 'quote.revision_approved', null,
        'Approval rule', 'Organization policy', 'automatic_rule',
        'Verified revision approved by the organization threshold rule.',
        jsonb_build_object('revision_id', revision.id, 'threshold_bps', organization.approval_threshold_bps));
    end if;
  elsif p_action = 'approve' then
    if revision.state <> 'waiting' then raise exception using errcode = '55000', message = 'revision_not_waiting'; end if;
    if revision.valid_until < public.organization_local_date(quote_row.organization_id, statement_timestamp()) then raise exception using errcode = '22023', message = 'QUOTE_EXPIRED'; end if;
    update public.quote_revisions set state = 'approved', approved_by = caller, approved_at = now() where id = revision.id;
    update public.quotes set state = 'approved', version = version + 1, approved_by = caller, approved_at = now() where id = quote_row.id;
    next_state := 'approved';
  elsif p_action = 'reject' then
    if revision.state <> 'waiting' then raise exception using errcode = '55000', message = 'revision_not_waiting'; end if;
    if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then raise exception using errcode = '22023', message = 'rejection_reason_invalid'; end if;
    update public.quote_revisions set state = 'rejected', rejected_by = caller, rejected_at = now(), rejected_reason = btrim(p_reason) where id = revision.id;
    update public.quotes set state = 'rejected', version = version + 1, rejected_by = caller, rejected_at = now(), rejected_reason = btrim(p_reason) where id = quote_row.id;
    next_state := 'rejected';
  else
    if revision.state <> 'approved' then raise exception using errcode = '55000', message = 'revision_not_approved'; end if;
    if revision.valid_until < public.organization_local_date(quote_row.organization_id, statement_timestamp()) then raise exception using errcode = '22023', message = 'QUOTE_EXPIRED'; end if;
    v_issued_seller := revision.snapshot -> 'seller';
    if jsonb_typeof(v_issued_seller) <> 'object'
      or not (v_issued_seller ?& array[
        'legal_name', 'address_line1', 'address_line2', 'city', 'region',
        'postal_code', 'country_code', 'tax_identifier', 'contact_email', 'contact_phone'
      ])
      or jsonb_typeof(v_issued_seller -> 'legal_name') <> 'string'
      or nullif(btrim(v_issued_seller ->> 'legal_name'), '') is null
      or jsonb_typeof(v_issued_seller -> 'address_line1') <> 'string'
      or nullif(btrim(v_issued_seller ->> 'address_line1'), '') is null
      or jsonb_typeof(v_issued_seller -> 'address_line2') <> 'string'
      or jsonb_typeof(v_issued_seller -> 'city') <> 'string'
      or nullif(btrim(v_issued_seller ->> 'city'), '') is null
      or jsonb_typeof(v_issued_seller -> 'region') <> 'string'
      or jsonb_typeof(v_issued_seller -> 'postal_code') <> 'string'
      or jsonb_typeof(v_issued_seller -> 'country_code') <> 'string'
      or nullif(btrim(v_issued_seller ->> 'country_code'), '') is null
      or jsonb_typeof(v_issued_seller -> 'tax_identifier') not in ('string', 'null')
      or jsonb_typeof(v_issued_seller -> 'contact_email') not in ('string', 'null')
      or jsonb_typeof(v_issued_seller -> 'contact_phone') not in ('string', 'null') then
      raise exception using errcode = '55000', message = 'sealed_seller_snapshot_invalid';
    end if;
    update public.quote_revisions set state = 'issued', issued_by = caller, issued_at = now(),
      verification_code = upper(encode(extensions.gen_random_bytes(16), 'hex')) where id = revision.id;
    update public.quotes set state = 'issued', version = version + 1, issued_by = caller, issued_at = now(),
      seller_legal_name_snapshot = v_issued_seller ->> 'legal_name',
      seller_address_line1_snapshot = v_issued_seller ->> 'address_line1',
      seller_address_line2_snapshot = nullif(v_issued_seller ->> 'address_line2', ''),
      seller_city_snapshot = v_issued_seller ->> 'city',
      seller_region_snapshot = nullif(v_issued_seller ->> 'region', ''),
      seller_postal_code_snapshot = nullif(v_issued_seller ->> 'postal_code', ''),
      seller_country_code_snapshot = v_issued_seller ->> 'country_code',
      seller_tax_identifier_snapshot = v_issued_seller ->> 'tax_identifier',
      seller_contact_email_snapshot = v_issued_seller ->> 'contact_email',
      seller_contact_phone_snapshot = v_issued_seller ->> 'contact_phone'
    where id = quote_row.id;
    next_state := 'issued';
  end if;
  actor := public.quote_actor(quote_row.organization_id);
  insert into public.quote_activity (organization_id, quote_id, event_type, actor_user_id,
    actor_name_snapshot, actor_role_snapshot, actor_source, message, safe_metadata)
  values (quote_row.organization_id, quote_row.id, 'quote.revision_' || p_action, caller,
    actor->>'name', actor->>'role', 'signed_user', 'Verified quotation revision ' || p_action || ' completed.',
    jsonb_build_object('revision_id', revision.id, 'revision_number', revision.revision_number));
  result := jsonb_build_object('id', quote_row.id, 'number', quote_row.number, 'state', next_state,
    'version', quote_row.version + 1, 'current_revision_id', revision.id, 'revision_number', revision.revision_number);
  perform public.set_command_receipt_context('organization', quote_row.organization_id, p_command_id, request);
  insert into public.command_receipts (organization_id, command_id, command_type, aggregate_type, aggregate_id, actor_user_id, result)
  values (quote_row.organization_id, gen_random_uuid(), 'quote.revision_' || p_action, 'quote_revision', revision.id, caller, result);
  return result;
end;
$$;

commit;
