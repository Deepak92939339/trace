begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(77);

-- ---------------------------------------------------------------- fixtures
create function public.p1_fixture(p_tax_mode text, p_discount integer, p_items jsonb, p_submit boolean)
returns uuid
language plpgsql
as $$
declare
  v_created jsonb;
  v_quote uuid;
  v_revision uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
  v_created := public.create_verified_quote_draft(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3000000-0000-4000-8000-000000000001',
    'INR', 'en-IN', 'GST 18%', p_tax_mode::public.tax_price_basis,
    current_date, (current_date + 31), gen_random_uuid());
  v_quote := (v_created ->> 'id')::uuid;
  v_revision := (v_created ->> 'current_revision_id')::uuid;
  perform public.save_quote_draft(v_quote, 1, gen_random_uuid(), jsonb_build_object(
    'customer_id', 'a3000000-0000-4000-8000-000000000001', 'currency_code', 'INR',
    'locale', 'en-IN', 'tax_label', 'GST 18%', 'tax_mode', p_tax_mode,
    'discount_bps', p_discount, 'issue_date', current_date, 'valid_until', (current_date + 31),
    'notes', 'p1 fixture', 'items', p_items, 'charges', '[]'::jsonb));
  if p_submit then
    perform public.submit_quote_revision(v_quote, v_revision, 2, gen_random_uuid());
  end if;
  return v_quote;
end;
$$;

create function public.p1_item(p_product uuid, p_position integer, p_scaled bigint, p_scale bigint)
returns jsonb language sql as $$
  select jsonb_build_object('line_id', null, 'product_id', p_product, 'position', p_position,
    'quantity_scaled', p_scaled, 'quantity_scale', p_scale)
$$;

create function public.p1_exec_count(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin execute p_sql; get diagnostics n = row_count; return n; end;
$$;
grant execute on function public.p1_exec_count(text) to authenticated;

create temporary table p1_q (key text primary key, id uuid not null);
grant all on p1_q to authenticated, service_role;

-- Catalog costs and floor are set as the table owner (browser roles write via RLS, tested below).
update public.products set unit_cost_minor = 1000000 where id = 'a2000000-0000-4000-8000-000000000001';

-- S1: profitable, no floor
insert into p1_q values ('s1', public.p1_fixture('exclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), true));
select is((select margin_bps from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's1')), 1071::bigint,
  'margin_bps = (1,120,000 - 1,000,000) x 10000 / 1,120,000 rounded half up');
select is((select approval_reason_codes from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's1')), '{}'::text[], 'profitable quote with no floor gets no margin reason codes');
select is((select state::text from public.quotes where id = (select id from p1_q where key = 's1')), 'approved', 'profitable quote with no floor auto-approves');
select is((select lines_without_cost from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's1')), 0, 'all lines have cost');
select is((select margin_floor_bps from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's1')), null::integer, 'floor null is stored as null');

-- S2: below cost (cost 1,200,000 > revenue 1,120,000), no floor
update public.products set unit_cost_minor = 1200000 where id = 'a2000000-0000-4000-8000-000000000001';
insert into p1_q values ('s2', public.p1_fixture('exclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), true));
select is((select approval_reason_codes from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's2')), array['below_cost'], 'below_cost reason with floor null');
select is((select margin_bps from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's2')), -714::bigint, 'negative margin: sign applied after rounding the magnitude');
select is((select state::text from public.quotes where id = (select id from p1_q where key = 's2')), 'waiting', 'below-cost quote waits for approval');

-- S3: floor 2000 bps, margin 1071 bps -> under floor only
update public.products set unit_cost_minor = 1000000 where id = 'a2000000-0000-4000-8000-000000000001';
update public.organizations set margin_floor_bps = 2000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into p1_q values ('s3', public.p1_fixture('exclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), true));
select is((select approval_reason_codes from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's3')), array['margin_under_floor'], 'margin_under_floor when floor set and margin below it');
select is((select margin_floor_bps from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's3')), 2000, 'floor in force at submission is stored');

-- S3b: below cost with floor set -> both codes, sorted
update public.products set unit_cost_minor = 1200000 where id = 'a2000000-0000-4000-8000-000000000001';
insert into p1_q values ('s3b', public.p1_fixture('exclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), true));
select is((select approval_reason_codes from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's3b')), array['below_cost', 'margin_under_floor'], 'below cost with a floor adds both codes in byte order');

-- S4: exact comparison - margin exactly at the floor is not under it
update public.products set unit_cost_minor = 1000000 where id = 'a2000000-0000-4000-8000-000000000001';
update public.organizations set margin_floor_bps = 1071 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into p1_q values ('s4', public.p1_fixture('exclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), true));
select is((select approval_reason_codes from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's4')), '{}'::text[],
  'rounded margin equal to the floor but exact margin (1071.43) above it is not under floor');
update public.organizations set margin_floor_bps = 1072 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into p1_q values ('s4b', public.p1_fixture('exclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), true));
select is((select approval_reason_codes from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's4b')), array['margin_under_floor'],
  'floor of 1072 bps is above the exact margin 1071.43 and flags the quote');
update public.organizations set margin_floor_bps = null where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- S5: no cost on any line
update public.products set unit_cost_minor = null where id = 'a2000000-0000-4000-8000-000000000001';
insert into p1_q values ('s5', public.p1_fixture('exclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), true));
select is((select margin_bps from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's5')), null::bigint, 'no costed lines gives null margin');
select is((select lines_without_cost from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's5')), 1, 'lines without cost are counted');
select is((select approval_reason_codes from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's5')), '{}'::text[], 'no costed lines gives no margin codes');

-- S6: zero net revenue (100% discount) with a cost: no codes, no division
update public.products set unit_cost_minor = 1000000 where id = 'a2000000-0000-4000-8000-000000000001';
update public.organizations set margin_floor_bps = 5000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into p1_q values ('s6', public.p1_fixture('exclusive', 10000, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), true));
select is((select net_minor from public.quote_items where quote_id = (select id from p1_q where key = 's6')), 0::bigint, 'zero-revenue fixture has zero net');
select is((select array[(margin_bps is null)::text, cardinality(approval_reason_codes)::text] from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's6')),
  array['true', '1'], 'zero net revenue adds no margin codes (only the existing discount rule fires) and stores null margin');
update public.organizations set margin_floor_bps = null where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- S7: tax-INCLUSIVE mode: revenue is the line net ex-tax
update public.products set unit_cost_minor = 800000 where id = 'a2000000-0000-4000-8000-000000000001';
insert into p1_q values ('s7', public.p1_fixture('inclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), true));
select is((select net_minor from public.quote_items where quote_id = (select id from p1_q where key = 's7')), 949153::bigint, 'inclusive mode: item net is the ex-tax amount 1,120,000 / 1.18');
select is((select margin_bps from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's7')), 1571::bigint,
  'inclusive mode margin uses net ex-tax revenue (949,153), not gross (which would give 2857)');

-- S8: mixed lines, one without cost
update public.products set unit_cost_minor = 1000000 where id = 'a2000000-0000-4000-8000-000000000001';
update public.products set unit_cost_minor = null where id = 'a2000000-0000-4000-8000-000000000003';
insert into p1_q values ('s8', public.p1_fixture('exclusive', 0, jsonb_build_array(
  public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1),
  public.p1_item('a2000000-0000-4000-8000-000000000003', 2, 1, 1)), true));
select is((select array[margin_bps::text, lines_without_cost::text] from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's8')),
  array['1071', '1'], 'uncosted lines are excluded from revenue and cost and counted');

-- S9: per-line cost uses the kernel rounding (half up) on quantity
update public.products set unit_cost_minor = 100001 where id = 'a2000000-0000-4000-8000-000000000002';
insert into p1_q values ('s9', public.p1_fixture('exclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000002', 1, 1555, 1000)), true));
select is((select margin_bps from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's9')), 7436::bigint,
  'revenue 606,450, line cost round(100001 x 1.555) = 155,502, margin 7436 bps');

-- ------------------------------------------------ server-side cost capture (D)
update public.products set unit_cost_minor = 555000 where id = 'a2000000-0000-4000-8000-000000000001';
insert into p1_q values ('d1', public.p1_fixture('exclusive', 0, jsonb_build_array(public.p1_item('a2000000-0000-4000-8000-000000000001', 1, 1, 1)), false));
select is((select unit_cost_minor_snapshot from public.quote_items where quote_id = (select id from p1_q where key = 'd1')), 555000::bigint, 'save captures catalog cost server-side');
insert into public.quote_items (id, organization_id, quote_id, product_id, position, sku_snapshot, description_snapshot,
  unit_code_snapshot, quantity_precision_snapshot, unit_price_minor_snapshot, currency_code, quantity_scaled, quantity_scale,
  tax_code_snapshot, tax_bps_snapshot, tax_price_basis_snapshot, tax_treatment_snapshot, base_minor, discount_minor, net_minor,
  tax_minor, line_total_minor, unit_cost_minor_snapshot)
select gen_random_uuid(), organization_id, quote_id, product_id, 2, sku_snapshot, description_snapshot,
  unit_code_snapshot, quantity_precision_snapshot, unit_price_minor_snapshot, currency_code, quantity_scaled, quantity_scale,
  tax_code_snapshot, tax_bps_snapshot, tax_price_basis_snapshot, tax_treatment_snapshot, base_minor, discount_minor, net_minor,
  tax_minor, line_total_minor, 424242
from public.quote_items where quote_id = (select id from p1_q where key = 'd1');
select is((select unit_cost_minor_snapshot from public.quote_items where quote_id = (select id from p1_q where key = 'd1') and position = 2), 555000::bigint,
  'an insert that supplies a fake cost gets the catalog cost instead');
-- editing a frozen line keeps its captured cost even after the catalog changes
update public.products set unit_cost_minor = 777000 where id = 'a2000000-0000-4000-8000-000000000001';
select lives_ok($$select public.save_quote_draft((select id from p1_q where key = 'd1'), (select version from public.quotes where id = (select id from p1_q where key = 'd1')), gen_random_uuid(), jsonb_build_object(
  'customer_id', 'a3000000-0000-4000-8000-000000000001', 'currency_code', 'INR', 'locale', 'en-IN', 'tax_label', 'GST 18%',
  'tax_mode', 'exclusive', 'discount_bps', 0, 'issue_date', current_date, 'valid_until', (current_date + 31), 'notes', 'p1 fixture',
  'items', jsonb_build_array(jsonb_build_object('line_id', (select id from public.quote_items where quote_id = (select id from p1_q where key = 'd1') and position = 1), 'product_id', 'a2000000-0000-4000-8000-000000000001', 'position', 1, 'quantity_scaled', 2, 'quantity_scale', 1)),
  'charges', '[]'::jsonb))$$, 'saving an existing line succeeds');
select is((select unit_cost_minor_snapshot from public.quote_items where quote_id = (select id from p1_q where key = 'd1') and position = 1), 555000::bigint, 'an existing line keeps its captured cost until it is refreshed');
select lives_ok($$select public.refresh_quote_line_from_catalog((select id from p1_q where key = 'd1'),
  (select id from public.quote_items where quote_id = (select id from p1_q where key = 'd1') and position = 1),
  (select version from public.quotes where id = (select id from p1_q where key = 'd1')), gen_random_uuid())$$, 'catalog refresh succeeds');
select is((select unit_cost_minor_snapshot from public.quote_items where quote_id = (select id from p1_q where key = 'd1') and position = 1), 777000::bigint, 'catalog refresh recaptures the current catalog cost');

-- ------------------------------------------- draft margin view and reviewer
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.quote_draft_margin where quote_id = (select id from p1_q where key = 'd1')), 1, 'manager reads the draft margin');
select is((select array[margin_bps::text, lines_without_cost::text, below_cost::text, under_floor::text] from public.quote_draft_margin where quote_id = (select id from p1_q where key = 'd1')),
  array['3063', '0', 'false', 'false'], 'draft margin: net 2,240,000, cost round(777,000 x 2) = 1,554,000, margin 3063 bps');
select is((select count(*)::integer from public.quote_revision_margins where quote_id = (select id from p1_q where key = 's2')), 1, 'manager reads stored revision margin');
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::integer from public.quote_draft_margin where quote_id = (select id from p1_q where key = 'd1')), 1, 'operator holds margin.read and reads the draft margin');
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is((select count(*)::integer from public.quote_draft_margin), 0, 'reviewer cannot read any draft margin');
select is((select count(*)::integer from public.quote_revision_margins), 0, 'reviewer cannot read any stored margin');
select is((select count(*)::integer from public.quote_revisions where quote_id = (select id from p1_q where key = 's2')), 1, 'reviewer still reads revisions (quote.read) ...');
select throws_ok($$select margin_bps from public.quote_revisions limit 1$$, '42501', null, '... but not the margin column');
select throws_ok($$select unit_cost_minor from public.products limit 1$$, '42501', null, 'reviewer cannot read product cost');
select throws_ok($$select margin_floor_bps from public.organizations limit 1$$, '42501', null, 'reviewer cannot read the margin floor');
select throws_ok($$select unit_cost_minor_snapshot from public.quote_items limit 1$$, '42501', null, 'reviewer cannot read line cost snapshots');
select is((select count(*)::integer from public.products), 3, 'reviewer still reads the catalog columns it always could');
set local request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::integer from public.quote_draft_margin) + (select count(*)::integer from public.quote_revision_margins), 0, 'other organization sees no margins');
select throws_ok($$select unit_cost_minor from public.products limit 1$$, '42501', null, 'direct cost select is revoked for every browser role');
reset role;

-- anon and authenticated hold no SELECT on any new column
select ok(not has_column_privilege('anon', 'public.products', 'unit_cost_minor', 'select') and not has_column_privilege('authenticated', 'public.products', 'unit_cost_minor', 'select'), 'no browser SELECT on products.unit_cost_minor');
select ok(not has_column_privilege('anon', 'public.organizations', 'margin_floor_bps', 'select') and not has_column_privilege('authenticated', 'public.organizations', 'margin_floor_bps', 'select'), 'no browser SELECT on organizations.margin_floor_bps');
select ok(not has_column_privilege('anon', 'public.quote_items', 'unit_cost_minor_snapshot', 'select') and not has_column_privilege('authenticated', 'public.quote_items', 'unit_cost_minor_snapshot', 'select'), 'no browser SELECT on quote_items.unit_cost_minor_snapshot');
select ok(not has_column_privilege('anon', 'public.quote_revisions', 'margin_bps', 'select') and not has_column_privilege('authenticated', 'public.quote_revisions', 'margin_bps', 'select')
  and not has_column_privilege('anon', 'public.quote_revisions', 'margin_floor_bps', 'select') and not has_column_privilege('authenticated', 'public.quote_revisions', 'margin_floor_bps', 'select')
  and not has_column_privilege('anon', 'public.quote_revisions', 'lines_without_cost', 'select') and not has_column_privilege('authenticated', 'public.quote_revisions', 'lines_without_cost', 'select'), 'no browser SELECT on quote_revisions margin columns');
select ok(not has_table_privilege('anon', 'public.quote_draft_margin', 'select') and not has_table_privilege('anon', 'public.quote_revision_margins', 'select'), 'anon cannot read the margin views');
select ok(not has_table_privilege('authenticated', 'public.quote_margin_calc', 'select') and not has_table_privilege('anon', 'public.quote_margin_calc', 'select'), 'the internal margin calculation is not readable by browser roles');
select is(array(select role.key from public.roles role join public.role_capabilities mapping on mapping.role_id = role.id where mapping.capability_key = 'margin.read' order by 1),
  array['manager', 'operator', 'organization_admin'], 'margin.read is held by operator, manager and organization_admin only');

-- ------------------------------------------------ writes: views with INSTEAD OF triggers
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.p1_exec_count($sql$update public.product_unit_costs set unit_cost_minor = 123456 where id = 'a2000000-0000-4000-8000-000000000001' and version = (select version from public.product_unit_costs where id = 'a2000000-0000-4000-8000-000000000001')$sql$), 1, 'operator can set a product cost (version-filtered update)');
select is((select version from public.product_unit_costs where id = 'a2000000-0000-4000-8000-000000000001') > 1, true, 'setting a cost bumps the product version');
select is(public.p1_exec_count($sql$update public.product_unit_costs set unit_cost_minor = 1 where id = 'a2000000-0000-4000-8000-000000000001' and version = 0$sql$), 0, 'a stale expected version updates nothing');
select throws_ok($$update public.product_unit_costs set unit_cost_minor = -1 where id = 'a2000000-0000-4000-8000-000000000001'$$, '23514', null, 'negative cost is rejected');
select throws_ok($$update public.product_unit_costs set version = 99 where id = 'a2000000-0000-4000-8000-000000000001'$$, '42501', null, 'only the cost column is writable through the view');
select throws_ok($$update public.products set unit_cost_minor = 1 where id = 'a2000000-0000-4000-8000-000000000001'$$, '42501', null, 'the base table stays closed to direct writes');
select throws_ok($$update public.organization_margin_policy set margin_floor_bps = 1000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '42501', 'margin_floor_forbidden', 'operator cannot set the margin floor (organization.manage required)');
set local request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(public.p1_exec_count($sql$update public.organization_margin_policy set margin_floor_bps = 1000 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$sql$), 1, 'organization admin can set the margin floor');
select throws_ok($$update public.organization_margin_policy set margin_floor_bps = 10001 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '23514', null, 'floor above 10000 bps is rejected');
select throws_ok($$update public.organizations set margin_floor_bps = 5 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '42501', null, 'the base organizations table stays closed to direct writes');
set local request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is(public.p1_exec_count($sql$update public.product_unit_costs set unit_cost_minor = 9 where id = 'a2000000-0000-4000-8000-000000000001'$sql$), 0, 'reviewer cannot see or write product cost');
select is(public.p1_exec_count($sql$update public.organization_margin_policy set margin_floor_bps = 9 where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$sql$), 0, 'reviewer cannot see or write the margin floor');
select is((select count(*)::integer from public.product_unit_costs) + (select count(*)::integer from public.organization_margin_policy), 0, 'reviewer reads neither cost nor floor through the write views');
reset role;
select is((select unit_cost_minor from public.products where id = 'a2000000-0000-4000-8000-000000000001'), 123456::bigint, 'reviewer write left the cost unchanged');
-- a catalog.manage holder without margin.read can neither see nor write cost
delete from public.role_capabilities where capability_key = 'margin.read' and role_id = (select id from public.roles where key = 'operator');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.p1_exec_count($sql$update public.product_unit_costs set unit_cost_minor = 5 where id = 'a2000000-0000-4000-8000-000000000001'$sql$), 0, 'cost writes need margin.read in addition to catalog.manage');
reset role;

-- ----------------------------------------------- sealed output carries no cost
select is((select (snapshot::text ~* '(cost|margin)')::text || (calculation_document::text ~* '(cost|margin)')::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's2')),
  'falsefalse', 'sealed snapshot and calculation document of a below-cost quote contain no cost or margin text');
select is((select snapshot #> '{approval_policy,reason_codes}' from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's2')), '[]'::jsonb, 'snapshot omits margin reason codes');
select is((select snapshot #>> '{approval_policy,requires_manual_approval}' from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's2')), 'true', 'snapshot still records that manual approval applied');
select is((select snapshot_hash::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's2')),
  (select public.sha256_hex(public.canonical_json_v1(public.quote_snapshot_v1(r.id, r.calculation_fingerprint::text, r.approval_threshold_bps, r.requires_manual_approval, array[]::text[]))) from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's2')),
  'below-cost snapshot hash equals the hash of the snapshot built without margin codes');
select is((select snapshot_hash::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's5')),
  (select public.sha256_hex(public.canonical_json_v1(public.quote_snapshot_v1(r.id, r.calculation_fingerprint::text, r.approval_threshold_bps, r.requires_manual_approval, r.approval_reason_codes))) from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p1_q where key = 's5')),
  'a costless quote hashes exactly as the pre-P1 submit path would');

-- F: every function that feeds snapshot, calculation and fingerprint bytes is unchanged
select is((select string_agg(p.oid::regprocedure::text || '|' || md5(pg_get_functiondef(p.oid)), E'\n' order by p.oid::regprocedure::text)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('quote_snapshot_v1', 'quote_calculation_document_v1', 'canonical_json_v1', 'canonical_json_string_v1', 'sha256_hex', 'calculate_quote_payload', 'recalculate_quote')),
  E'calculate_quote_payload(jsonb)|2f5ba7b62b5b834feb93b80a8f1828c1\ncanonical_json_string_v1(text)|9c052f19c019be0434f023d21ce70a58\ncanonical_json_v1(jsonb)|13aecb072319880f6cb5bf1c0b546c6a\nquote_calculation_document_v1(uuid)|d71620176fc951e325cdbcf36207677b\nquote_snapshot_v1(uuid,text,integer,boolean,text[])|da3812571e7f006b0609b49169fb3506\nrecalculate_quote(uuid,uuid)|15d78cae968e50fe85b4fc84d3072c37\nsha256_hex(bytea)|8aa4ed33ef421d5c77d6a83b06e54c09',
  'snapshot, calculation, canonical JSON and fingerprint functions are byte-identical to their pre-P1 definitions');

-- B: the public broker response for an issued below-cost quote (keys and values)
create temporary table p1_link (selector uuid, secret text);
grant all on p1_link to authenticated, service_role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$select public.approve_quote_revision((select id from p1_q where key = 's2'),
  (select current_revision_id from public.quotes where id = (select id from p1_q where key = 's2')), 3, gen_random_uuid())$$, 'manager approves the below-cost revision');
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select public.issue_quote_revision((select id from p1_q where key = 's2'),
  (select current_revision_id from public.quotes where id = (select id from p1_q where key = 's2')), 4, gen_random_uuid())$$, 'below-cost revision issues');
with shared as (
  select public.create_quote_share_link((select id from p1_q where key = 's2'),
    (select current_revision_id from public.quotes where id = (select id from p1_q where key = 's2')), 5,
    'buyer@example.test', (now() + interval '18 days'), gen_random_uuid()) result)
insert into p1_link select (result ->> 'selector')::uuid, result ->> 'secret' from shared;
reset role;
create temporary table p1_broker (response jsonb);
grant all on p1_broker to service_role;
set local role service_role;
insert into p1_broker select public.broker_open_quote((select selector from p1_link), (select secret from p1_link),
  extensions.digest(convert_to('p1-subject', 'UTF8'), 'sha256'));
reset role;
select is((select response ->> 'status' from p1_broker), 'ok', 'broker opens the issued below-cost quote');
select is((select (response::text ~* '(cost|margin)')::text from p1_broker), 'false', 'no key or string in the public broker response matches /cost|margin/i');
select is((select (response::text ~ 'approval_reason_codes')::text from p1_broker), 'false', 'approval_reason_codes is absent from the buyer projection');
select is((select response #> '{value,snapshot,approval_policy,reason_codes}' from p1_broker), '[]'::jsonb, 'buyer snapshot carries no margin reason code');
select is((select approval_reason_codes from public.quote_revisions where id = (select current_revision_id from public.quotes where id = (select id from p1_q where key = 's2'))), array['below_cost'], 'the internal revision row still records below_cost');

select * from finish();
rollback;
