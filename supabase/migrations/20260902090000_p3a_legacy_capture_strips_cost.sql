-- P3a: internal cost must never be copied into a legacy capture.
-- Since P1, quote_items has unit_cost_minor_snapshot (internal cost). Adopting a
-- legacy quote copied every item column with to_jsonb(item) into
-- quote_revisions.legacy_snapshot, which browser roles can still select. This
-- redefinition (verbatim copy of 20260814110000_s1_revision_commands.sql plus the
-- key removal) stops new captures from carrying cost. Stored legacy_snapshot rows
-- are deliberately not rewritten.
begin;

create or replace function public.start_verified_revision_from_legacy_quote(
  p_quote_id uuid,
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
  request jsonb := jsonb_build_object('quote_id', p_quote_id, 'expected_version', p_expected_version);
  replay jsonb;
  capture_id uuid;
  revision_id uuid;
  result jsonb;
  actor jsonb;
begin
  if caller is null then raise exception using errcode = '42501', message = 'authentication_required'; end if;
  if p_command_id is null then raise exception using errcode = '22023', message = 'command_id_required'; end if;
  select * into quote_row from public.quotes where id = p_quote_id for update;
  if quote_row.id is null or not public.has_org_capability(quote_row.organization_id, 'quote.revise') then
    raise exception using errcode = '42501', message = 'quote_revise_forbidden';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('organization:' || quote_row.organization_id::text || ':' || p_command_id::text, 0));
  replay := public.command_receipt_replay('organization', quote_row.organization_id, p_command_id,
    'quote.adopt_legacy', 'quote', p_quote_id, request);
  if replay is not null then return replay; end if;
  if quote_row.current_revision_id is not null or quote_row.revision_counter <> 0 then
    raise exception using errcode = '55000', message = 'quote_already_revisioned';
  end if;
  if quote_row.version <> p_expected_version then raise exception using errcode = '40001', message = 'quote_version_stale'; end if;

  insert into public.quote_revisions (
    organization_id, quote_id, revision_number, record_kind, state, source_quote_version,
    created_by, legacy_snapshot, legacy_captured_at
  ) values (
    quote_row.organization_id, quote_row.id, 0, 'legacy_capture', quote_row.state,
    quote_row.version, caller,
    jsonb_build_object(
      'evidence_status', 'unverified_legacy_capture',
      'quote', to_jsonb(quote_row),
      'items', coalesce((select jsonb_agg((to_jsonb(item) - 'unit_cost_minor_snapshot') order by item.position) from public.quote_items item where item.quote_id = quote_row.id), '[]'::jsonb),
      'charges', coalesce((select jsonb_agg(to_jsonb(charge) order by charge.position) from public.quote_charges charge where charge.quote_id = quote_row.id), '[]'::jsonb)
    ), now()
  ) returning id into capture_id;
  insert into public.quote_revisions (
    organization_id, quote_id, revision_number, record_kind, state, legacy_source_revision_id,
    source_quote_version, created_by
  ) values (quote_row.organization_id, quote_row.id, 1, 'verified_revision', 'draft', capture_id,
    quote_row.version + 1, caller)
  returning id into revision_id;
  update public.quotes set state = 'draft', version = version + 1,
    current_revision_id = revision_id, accepted_revision_id = null, revision_counter = 1,
    submitted_by = null, submitted_at = null, approved_by = null, approved_at = null,
    rejected_by = null, rejected_at = null, rejected_reason = null, issued_by = null, issued_at = null
  where id = quote_row.id;
  update public.quotes set
    seller_legal_name_snapshot = null, seller_address_line1_snapshot = null,
    seller_address_line2_snapshot = null, seller_city_snapshot = null,
    seller_region_snapshot = null, seller_postal_code_snapshot = null,
    seller_country_code_snapshot = null, seller_tax_identifier_snapshot = null,
    seller_contact_email_snapshot = null, seller_contact_phone_snapshot = null
  where id = quote_row.id;
  actor := public.quote_actor(quote_row.organization_id);
  insert into public.quote_activity (organization_id, quote_id, event_type, actor_user_id,
    actor_name_snapshot, actor_role_snapshot, actor_source, message, safe_metadata)
  values (quote_row.organization_id, quote_row.id, 'quote.verified_revision_started', caller,
    actor->>'name', actor->>'role', 'signed_user',
    'Legacy quotation captured without verification evidence; verified revision 1 started.',
    jsonb_build_object('legacy_capture_id', capture_id, 'revision_id', revision_id));
  result := jsonb_build_object('id', quote_row.id, 'number', quote_row.number, 'state', 'draft',
    'version', quote_row.version + 1, 'legacy_capture_id', capture_id,
    'current_revision_id', revision_id, 'revision_number', 1);
  perform public.set_command_receipt_context('organization', quote_row.organization_id, p_command_id, request);
  insert into public.command_receipts (organization_id, command_id, command_type, aggregate_type, aggregate_id, actor_user_id, result)
  values (quote_row.organization_id, gen_random_uuid(), 'quote.adopt_legacy', 'quote', quote_row.id, caller, result);
  return result;
end;
$$;

commit;
