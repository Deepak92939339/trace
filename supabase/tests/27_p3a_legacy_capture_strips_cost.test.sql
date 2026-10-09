begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

-- Every object key anywhere inside a jsonb value.
create function public.p3a_keys(p_value jsonb) returns setof text language sql as $$
  select key
  from jsonb_path_query(p_value, 'strict $.**') node,
    lateral jsonb_object_keys(case when jsonb_typeof(node) = 'object' then node else '{}'::jsonb end) key
$$;

-- A product with a cost, and a legacy (pre-revision) quote whose line captures it.
update public.products set unit_cost_minor = 555000 where id = 'a2000000-0000-4000-8000-000000000001';
create temporary table p3a_q (key text primary key, id uuid not null);
grant all on p3a_q to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
with legacy as (
  select public.create_quote_draft(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3000000-0000-4000-8000-000000000001',
    'INR', 'en-IN', 'GST 18%', 'exclusive', current_date, (current_date + 31),
    'c1000000-0000-4000-8000-000000000001') result
)
insert into p3a_q values ('legacy', (select (result ->> 'id')::uuid from legacy));
select lives_ok($$select public.save_quote_draft((select id from p3a_q where key = 'legacy'), 1,
  'c1000000-0000-4000-8000-000000000002', jsonb_build_object(
    'customer_id', 'a3000000-0000-4000-8000-000000000001', 'currency_code', 'INR',
    'locale', 'en-IN', 'tax_label', 'GST 18%', 'tax_mode', 'exclusive',
    'discount_bps', 0, 'issue_date', current_date, 'valid_until', (current_date + 31),
    'notes', 'legacy', 'items', jsonb_build_array(jsonb_build_object('line_id', null,
      'product_id', 'a2000000-0000-4000-8000-000000000001', 'position', 1, 'quantity_scaled', 1, 'quantity_scale', 1)),
    'charges', '[]'::jsonb))$$, 'a legacy quote is prepared through the old draft path');
reset role;

select is((select unit_cost_minor_snapshot from public.quote_items where quote_id = (select id from p3a_q where key = 'legacy')), 555000::bigint,
  'the legacy quote line captured the catalog cost server-side');
select is((select to_jsonb(item) ? 'unit_cost_minor_snapshot' from public.quote_items item where quote_id = (select id from p3a_q where key = 'legacy')), true,
  'control: the raw row jsonb the old function copied does contain the cost key');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$select public.start_verified_revision_from_legacy_quote((select id from p3a_q where key = 'legacy'),
  (select version from public.quotes where id = (select id from p3a_q where key = 'legacy')), 'c1000000-0000-4000-8000-000000000003')$$,
  'the legacy quote is adopted');
reset role;

create temporary table p3a_capture as
  select legacy_snapshot from public.quote_revisions
  where quote_id = (select id from p3a_q where key = 'legacy') and record_kind = 'legacy_capture';

select is((select count(*)::integer from p3a_capture), 1, 'adoption stored one legacy capture');
select is((select count(*)::integer from p3a_capture, lateral public.p3a_keys(legacy_snapshot) key where key ~* 'unit_cost'), 0,
  'the legacy_snapshot contains no key matching unit_cost anywhere, items included');
select is((select (legacy_snapshot::text ~* 'unit_cost')::text from p3a_capture), 'false', 'no unit_cost text appears anywhere in the legacy_snapshot');
select is((select array_agg(distinct key order by key) @> array['unit_price_minor_snapshot', 'net_minor', 'sku_snapshot'] from p3a_capture, lateral public.p3a_keys(legacy_snapshot) key), true,
  'the rest of the legacy evidence (price, net, sku) is still captured');

select * from finish();
rollback;
