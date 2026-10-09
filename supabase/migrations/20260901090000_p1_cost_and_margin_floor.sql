-- P1: internal cost price and margin floor.
-- Cost and margin never enter CanonicalQuoteSnapshotV1, the calculation
-- document, fingerprints, buyer projections or print documents. Browser roles
-- have no SELECT on the new columns. Reads and writes go through margin.read /
-- organization.manage gated owner-rights views (writes via INSTEAD OF
-- triggers), not through new functions: existing tests 15 and 18 pin the exact
-- set of routines browser roles may execute.
begin;

insert into public.capabilities (key, label)
values ('margin.read', 'Read cost price and margin');

insert into public.role_capabilities (role_id, capability_key)
select role.id, 'margin.read'
from public.roles role
where role.key in ('operator', 'manager', 'organization_admin');

alter table public.products
  add column unit_cost_minor bigint
    check (unit_cost_minor is null or (unit_cost_minor >= 0 and unit_cost_minor <= 9007199254740991));
alter table public.organizations
  add column margin_floor_bps integer
    check (margin_floor_bps is null or margin_floor_bps between 0 and 10000);
alter table public.quote_items
  add column unit_cost_minor_snapshot bigint
    check (unit_cost_minor_snapshot is null or (unit_cost_minor_snapshot >= 0 and unit_cost_minor_snapshot <= 9007199254740991));
alter table public.quote_revisions
  add column margin_bps bigint,
  add column margin_floor_bps integer
    check (margin_floor_bps is null or margin_floor_bps between 0 and 10000),
  add column lines_without_cost integer
    check (lines_without_cost is null or lines_without_cost >= 0);

-- Browser roles lose table-wide SELECT on the four tables and keep exactly the
-- columns that existed before this migration. New columns have no grant.
do $$
declare
  table_name text;
  column_list text;
begin
  foreach table_name in array array['products', 'organizations', 'quote_items', 'quote_revisions'] loop
    select string_agg(format('%I', attribute.attname), ', ' order by attribute.attnum)
    into column_list
    from pg_catalog.pg_attribute attribute
    where attribute.attrelid = ('public.' || table_name)::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attname not in (
        'unit_cost_minor', 'margin_floor_bps', 'unit_cost_minor_snapshot',
        'margin_bps', 'lines_without_cost'
      );
    execute format('revoke select on public.%I from authenticated', table_name);
    execute format('grant select (%s) on public.%I to authenticated', column_list, table_name);
  end loop;
end;
$$;

-- Cost is captured server-side from the catalog and never from the caller.
create or replace function public.capture_quote_item_unit_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.unit_cost_minor_snapshot := (
    select product.unit_cost_minor
    from public.products product
    where product.id = new.product_id
      and product.organization_id = new.organization_id
  );
  return new;
end;
$$;

create trigger quote_items_capture_unit_cost
before insert on public.quote_items
for each row execute function public.capture_quote_item_unit_cost();

-- The single margin computation, as an internal view. It is a view rather than
-- a function because function EXECUTE is checked as the invoking user, and the
-- exact set of routines browser roles may execute is pinned by existing tests.
-- Net revenue is the line net after discount, excluding tax and charges, over
-- lines that have a cost. Cost per line is round-half-up(cost x quantity_scaled
-- / quantity_scale), the kernel rule. margin_bps is the rounded display value
-- (sign applied after rounding the magnitude); the reason flags use exact
-- integer comparisons, never the rounded value.
create view public.quote_margin_calc as
select
  q.id as quote_id,
  q.organization_id,
  q.state,
  organization.margin_floor_bps as floor_bps,
  coalesce(lines.lines_without_cost, 0)::integer as lines_without_cost,
  case when metrics.active then
    (sign(metrics.gap) * least(
      floor((abs(metrics.gap) * 10000 + floor(metrics.revenue / 2)) / metrics.revenue),
      9007199254740991))::bigint
  end as margin_bps,
  (metrics.active and metrics.cost > metrics.revenue) as below_cost,
  (metrics.active and organization.margin_floor_bps is not null
    and metrics.gap * 10000 < organization.margin_floor_bps::numeric * metrics.revenue) as under_floor
from public.quotes q
join public.organizations organization on organization.id = q.organization_id
left join (
  select
    item.quote_id,
    coalesce(sum(item.net_minor) filter (where item.unit_cost_minor_snapshot is not null), 0) as revenue,
    coalesce(sum(case when item.unit_cost_minor_snapshot is not null then
      floor((item.unit_cost_minor_snapshot::numeric * item.quantity_scaled
        + floor(item.quantity_scale::numeric / 2)) / item.quantity_scale) end), 0) as cost,
    count(*) filter (where item.unit_cost_minor_snapshot is not null) as costed_lines,
    count(*) filter (where item.unit_cost_minor_snapshot is null) as lines_without_cost
  from public.quote_items item
  group by item.quote_id
) lines on lines.quote_id = q.id
cross join lateral (
  select
    coalesce(lines.revenue, 0)::numeric as revenue,
    coalesce(lines.cost, 0)::numeric as cost,
    coalesce(lines.revenue, 0)::numeric - coalesce(lines.cost, 0)::numeric as gap,
    coalesce(lines.costed_lines, 0) > 0 and coalesce(lines.revenue, 0) > 0 as active
) metrics;

revoke all on function public.capture_quote_item_unit_cost() from public, anon, authenticated;
revoke all on public.quote_margin_calc from public, anon, authenticated;

-- margin.read-gated, owner-rights read paths over the internal calculation.
create view public.quote_revision_margins
with (security_barrier = true) as
select
  revision.organization_id,
  revision.quote_id,
  revision.id as revision_id,
  revision.margin_bps,
  revision.margin_floor_bps,
  revision.lines_without_cost
from public.quote_revisions revision
where public.has_org_capability(revision.organization_id, 'margin.read')
  and public.has_org_capability(revision.organization_id, 'quote.read');

create view public.quote_draft_margin
with (security_barrier = true) as
select
  calc.quote_id,
  calc.margin_bps,
  calc.floor_bps,
  calc.lines_without_cost,
  calc.below_cost,
  calc.under_floor
from public.quote_margin_calc calc
where calc.state = 'draft'
  and public.has_org_capability(calc.organization_id, 'margin.read')
  and public.has_org_capability(calc.organization_id, 'quote.read');

revoke all on public.quote_revision_margins, public.quote_draft_margin from public, anon, authenticated;
grant select on public.quote_revision_margins, public.quote_draft_margin to authenticated;

-- Writes. Browser roles cannot UPDATE products or organizations directly (CHECK
-- constraints call functions they may not execute), and existing test 15 pins
-- the exact set of routines browser roles may execute, so there are no new
-- RPCs. Instead each write surface is an updatable view whose INSTEAD OF
-- trigger runs with owner rights; trigger functions need no EXECUTE grant.
-- Optimistic concurrency is the version filter in the caller's WHERE clause.
create view public.product_unit_costs
with (security_barrier = true) as
select product.id, product.organization_id, product.version, product.unit_cost_minor
from public.products product
where public.has_org_capability(product.organization_id, 'margin.read')
  and public.has_org_capability(product.organization_id, 'catalog.read');

create view public.organization_margin_policy
with (security_barrier = true) as
select organization.id, organization.version, organization.margin_floor_bps
from public.organizations organization
where public.has_org_capability(organization.id, 'margin.read');

create or replace function public.write_product_unit_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if auth.uid() is null
    or not public.has_org_capability(old.organization_id, 'catalog.manage')
    or not public.has_org_capability(old.organization_id, 'margin.read') then
    raise exception using errcode = '42501', message = 'product_cost_forbidden';
  end if;
  update public.products product
  set unit_cost_minor = new.unit_cost_minor
  where product.id = old.id and product.version = old.version
  returning product.version into v_version;
  if v_version is null then
    raise exception using errcode = 'P0001', message = 'product_version_stale';
  end if;
  new.version := v_version;
  return new;
end;
$$;

create or replace function public.write_organization_margin_floor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if auth.uid() is null
    or not public.has_org_capability(old.id, 'organization.manage') then
    raise exception using errcode = '42501', message = 'margin_floor_forbidden';
  end if;
  update public.organizations organization
  set margin_floor_bps = new.margin_floor_bps
  where organization.id = old.id and organization.version = old.version
  returning organization.version into v_version;
  if v_version is null then
    raise exception using errcode = 'P0001', message = 'organization_version_stale';
  end if;
  new.version := v_version;
  return new;
end;
$$;

create trigger product_unit_costs_write
instead of update on public.product_unit_costs
for each row execute function public.write_product_unit_cost();
create trigger organization_margin_policy_write
instead of update on public.organization_margin_policy
for each row execute function public.write_organization_margin_floor();

revoke all on function public.write_product_unit_cost(), public.write_organization_margin_floor()
  from public, anon, authenticated;
revoke all on public.product_unit_costs, public.organization_margin_policy from public, anon, authenticated;
grant select on public.product_unit_costs, public.organization_margin_policy to authenticated;
grant update (unit_cost_minor) on public.product_unit_costs to authenticated;
grant update (margin_floor_bps) on public.organization_margin_policy to authenticated;

-- Latest submit path (20260815100000_s1_issued_seller_snapshot_consistency.sql),
-- verbatim except for the margin additions. Margin reason codes are stored on
-- the internal revision row only; the sealed snapshot never receives them.
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
    v_snapshot_document := public.quote_snapshot_v1(revision.id, v_calculation_fingerprint,
      organization.approval_threshold_bps, requires_manual, v_public_reasons);
    v_snapshot_bytes := public.canonical_json_v1(v_snapshot_document);
    update public.quote_revisions set state = next_state, snapshot_format_version = 1,
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
-- Latest catalog refresh (20260723180000_c2_stable_draft_identity.sql), verbatim plus unit_cost_minor_snapshot.
create or replace function public.refresh_quote_line_from_catalog(
  p_quote_id uuid,
  p_line_id uuid,
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
  line_row public.quote_items%rowtype;
  product_row public.products%rowtype;
  tax_row public.tax_profiles%rowtype;
  request jsonb;
  replay jsonb;
  result jsonb;
  actor jsonb;
  new_scale bigint;
  new_quantity_scaled bigint;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_command_id is null then
    raise exception using errcode = '22023', message = 'command_id_required';
  end if;

  select *
  into quote_row
  from public.quotes quote
  where quote.id = p_quote_id
  for update;
  if quote_row.id is null
    or not public.has_org_capability(quote_row.organization_id, 'quote.edit') then
    raise exception using errcode = '42501', message = 'quote_edit_forbidden';
  end if;

  request := jsonb_build_object(
    'quote_id', p_quote_id,
    'line_id', p_line_id,
    'expected_version', p_expected_version
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'organization:' || quote_row.organization_id::text || ':' ||
      p_command_id::text,
      0
    )
  );
  replay := public.command_receipt_replay(
    'organization', quote_row.organization_id, p_command_id,
    'quote.line.refresh', 'quote', p_quote_id, request
  );
  if replay is not null then
    return replay;
  end if;
  if quote_row.state <> 'draft' then
    raise exception using errcode = '55000', message = 'quote_not_draft';
  end if;
  if quote_row.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'quote_version_stale';
  end if;

  select *
  into line_row
  from public.quote_items item
  where item.organization_id = quote_row.organization_id
    and item.quote_id = p_quote_id
    and item.id = p_line_id
  for update;
  if line_row.id is null or line_row.product_id is null then
    raise exception using errcode = '23503', message = 'quote_line_not_in_quote';
  end if;

  select *
  into product_row
  from public.products product
  where product.organization_id = quote_row.organization_id
    and product.id = line_row.product_id
    and product.active;
  if product_row.id is null or product_row.currency_code <> quote_row.currency_code then
    raise exception using errcode = '23503', message = 'quote_refresh_product_invalid';
  end if;
  select *
  into tax_row
  from public.tax_profiles tax
  where tax.organization_id = quote_row.organization_id
    and tax.id = product_row.tax_profile_id
    and tax.active;
  if tax_row.id is null then
    raise exception using errcode = '23503', message = 'quote_refresh_tax_invalid';
  end if;

  new_scale := power(10, product_row.quantity_precision)::bigint;
  if mod(line_row.quantity_scaled * new_scale, line_row.quantity_scale) <> 0 then
    raise exception using
      errcode = '22023',
      message = 'quote_line_refresh_quantity_incompatible';
  end if;
  new_quantity_scaled :=
    line_row.quantity_scaled * new_scale / line_row.quantity_scale;
  if not public.validate_quantity(
    product_row.unit_code::text,
    product_row.quantity_precision,
    new_quantity_scaled,
    new_scale
  ) then
    raise exception using
      errcode = '22023',
      message = 'quote_line_refresh_quantity_incompatible';
  end if;

  perform public.set_command_receipt_context(
    'organization', quote_row.organization_id, p_command_id, request
  );
  update public.quote_items item
  set
    sku_snapshot = product_row.sku,
    description_snapshot = product_row.description,
    unit_code_snapshot = product_row.unit_code,
    quantity_precision_snapshot = product_row.quantity_precision,
    unit_price_minor_snapshot = product_row.unit_price_minor,
    unit_cost_minor_snapshot = product_row.unit_cost_minor,
    currency_code = product_row.currency_code,
    quantity_scaled = new_quantity_scaled,
    quantity_scale = new_scale,
    tax_code_snapshot = tax_row.code,
    tax_bps_snapshot = tax_row.rate_bps,
    tax_price_basis_snapshot = quote_row.tax_mode,
    tax_treatment_snapshot = case
      when quote_row.customer_tax_treatment = 'standard'
        then tax_row.treatment
      else quote_row.customer_tax_treatment
    end
  where item.organization_id = quote_row.organization_id
    and item.quote_id = p_quote_id
    and item.id = p_line_id;

  perform public.recalculate_quote(quote_row.organization_id, p_quote_id);
  update public.quotes quote
  set version = quote.version + 1
  where quote.organization_id = quote_row.organization_id
    and quote.id = p_quote_id;

  actor := public.quote_actor(quote_row.organization_id);
  insert into public.quote_activity (
    organization_id, quote_id, event_type, actor_user_id, actor_name_snapshot,
    actor_role_snapshot, actor_source, message, safe_metadata
  )
  values (
    quote_row.organization_id, p_quote_id, 'draft.line_refreshed', caller,
    actor ->> 'name', actor ->> 'role', 'signed_user',
    'Line pricing refreshed from catalog.',
    jsonb_build_object('line_id', p_line_id, 'product_id', product_row.id)
  );

  result := public.quote_draft_projection(quote_row.organization_id, p_quote_id);
  insert into public.command_receipts (
    organization_id, command_id, command_type, aggregate_type, aggregate_id,
    actor_user_id, result
  )
  values (
    quote_row.organization_id, p_command_id, 'quote.line.refresh', 'quote',
    p_quote_id, caller, result
  );
  return result;
end;
$$;

commit;
