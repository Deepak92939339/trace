begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(79);

-- ---------------------------------------------------------------- fixtures
create function public.p3_claims(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;

-- A draft (optionally with a schedule, optionally submitted) for product PCA-220 x 1.
create function public.p3_make(p_tax_mode text, p_discount integer, p_milestones jsonb, p_submit boolean)
returns uuid language plpgsql as $$
declare
  v_created jsonb; v_quote uuid; v_revision uuid;
begin
  perform public.p3_claims('11111111-1111-4111-8111-111111111111');
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
    'notes', 'p3 fixture', 'items', jsonb_build_array(jsonb_build_object('line_id', null,
      'product_id', 'a2000000-0000-4000-8000-000000000001', 'position', 1, 'quantity_scaled', 1, 'quantity_scale', 1)),
    'charges', '[]'::jsonb));
  if p_milestones is not null then
    update public.quote_payment_schedule_editor set milestones = p_milestones
    where quote_id = v_quote and version = (select version from public.quotes where id = v_quote);
  end if;
  if p_submit then
    perform public.submit_quote_revision(v_quote, v_revision,
      (select version from public.quotes where id = v_quote), gen_random_uuid());
  end if;
  return v_quote;
end;
$$;

create function public.p3_issue(p_quote uuid) returns void language plpgsql as $$
begin
  perform public.p3_claims('11111111-1111-4111-8111-111111111111');
  perform public.issue_quote_revision(p_quote, (select current_revision_id from public.quotes where id = p_quote),
    (select version from public.quotes where id = p_quote), gen_random_uuid());
end;
$$;

create temporary table p3_link (quote_id uuid, selector uuid, secret text);
grant all on p3_link to authenticated, service_role;
create function public.p3_share(p_quote uuid) returns void language plpgsql as $$
declare v jsonb;
begin
  perform public.p3_claims('11111111-1111-4111-8111-111111111111');
  v := public.create_quote_share_link(p_quote, (select current_revision_id from public.quotes where id = p_quote),
    (select version from public.quotes where id = p_quote), 'buyer@example.test', (now() + interval '18 days'), gen_random_uuid());
  insert into p3_link values (p_quote, (v ->> 'selector')::uuid, v ->> 'secret');
end;
$$;

create function public.p3_exec_count(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin execute p_sql; get diagnostics n = row_count; return n; end;
$$;
grant execute on function public.p3_exec_count(text) to authenticated;

create temporary table p3_q (key text primary key, id uuid not null);
grant all on p3_q to authenticated, service_role;

create function public.p3_sched(p_total_variant integer default 0) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('label', 'Deposit', 'basis_points', 5000, 'trigger', 'on_acceptance', 'due_date', null),
    jsonb_build_object('label', 'On delivery', 'basis_points', 3000, 'trigger', 'on_delivery', 'due_date', null),
    jsonb_build_object('label', 'Final instalment', 'basis_points', 2000, 'trigger', 'on_date', 'due_date', (current_date + 60)::text))
$$;

-- --------------------------------------------------------- amounts (SQL)
select is(public.quote_milestone_amounts(832572, array[5000, 3000, 2000]), array[416286, 249772, 166514]::bigint[], 'total 832572 at 5000/3000/2000 -> 416286 / 249772 / 166514');
select is(public.quote_milestone_amounts(100, array[3333, 3333, 3334]), array[33, 33, 34]::bigint[], 'the last milestone absorbs the remainder');
select is(public.quote_milestone_amounts(1321600, array[10000]), array[1321600]::bigint[], 'one milestone carries the whole total');
select is(public.quote_milestone_amounts(1, array[5000, 5000]), array[1, 0]::bigint[], 'half rounds up for every milestone but the last');
select throws_ok($$select public.quote_milestone_amounts(100, array[5000, 4000])$$, '22023', 'PAYMENT_SCHEDULE_INVALID', 'basis points that do not total 10000 are rejected');
select throws_ok($$select public.quote_milestone_amounts(0, array[10000])$$, '22023', 'PAYMENT_SCHEDULE_INVALID', 'a zero total is rejected');
select throws_ok($$select public.quote_milestone_amounts(2, array[2500, 2500, 2500, 2500])$$, '22023', 'PAYMENT_SCHEDULE_INVALID', 'a negative last amount is rejected');
select throws_ok($$select public.quote_milestone_amounts(100, array[0, 10000])$$, '22023', 'PAYMENT_SCHEDULE_INVALID', 'a zero-basis-point milestone is rejected');
select throws_ok($$select public.quote_milestone_amounts(1000, array_fill(1, array[13]))$$, '22023', 'PAYMENT_SCHEDULE_INVALID', 'more than 12 milestones are rejected');

-- ------------------------------------------------------------- privileges
select ok(not has_function_privilege('authenticated', 'public.quote_milestone_amounts(bigint,integer[])', 'execute') and not has_function_privilege('anon', 'public.quote_milestone_amounts(bigint,integer[])', 'execute'), 'browser roles cannot execute the amount function');
select ok(not has_function_privilege('authenticated', 'public.quote_snapshot_v2(uuid,text,integer,boolean,text[])', 'execute'), 'browser roles cannot execute the v2 snapshot builder');
select ok(not has_function_privilege('authenticated', 'public.write_quote_payment_schedule()', 'execute'), 'browser roles cannot execute the editor trigger function');
select ok(not has_table_privilege('anon', 'public.quote_payment_milestones', 'select') and not has_table_privilege('anon', 'public.quote_payment_schedule_editor', 'select'), 'anon reads no schedule');
select ok(not has_table_privilege('authenticated', 'public.quote_payment_milestones', 'insert') and not has_table_privilege('authenticated', 'public.quote_payment_milestones', 'update') and not has_table_privilege('authenticated', 'public.quote_payment_milestones', 'delete'), 'authenticated has no direct DML on milestones');

-- ------------------------------------------------------------ editing path
insert into p3_q values ('d', public.p3_make('exclusive', 0, null, false));
select is((select total_minor from public.quotes where id = (select id from p3_q where key = 'd')), 1321600::bigint, 'fixture total is 1,321,600');

set local role authenticated;
select public.p3_claims('11111111-1111-4111-8111-111111111111');
select is(public.p3_exec_count($sql$update public.quote_payment_schedule_editor set milestones = public.p3_sched()
  where quote_id = (select id from p3_q where key = 'd') and version = (select version from public.quote_payment_schedule_editor where quote_id = (select id from p3_q where key = 'd'))$sql$), 1, 'operator saves a schedule on a draft through the editor view');
select is((select jsonb_array_length(milestones) from public.quote_payment_schedule_editor where quote_id = (select id from p3_q where key = 'd')), 3, 'the editor view reads the schedule back');
select is((select array_agg(position order by position) from public.quote_payment_milestones where quote_id = (select id from p3_q where key = 'd')), array[1, 2, 3]::smallint[], 'positions follow array order');
select is(public.p3_exec_count($sql$update public.quote_payment_schedule_editor set milestones = '[]'::jsonb
  where quote_id = (select id from p3_q where key = 'd') and version = 1$sql$), 0, 'a stale version updates nothing');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = (select jsonb_agg(jsonb_build_object('label','x','basis_points',100,'trigger','on_acceptance','due_date',null)) from generate_series(1, 13))
  where quote_id = (select id from p3_q where key = 'd')$$, '22023', 'payment_schedule_invalid', 'more than 12 milestones are rejected');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"A","basis_points":6000,"trigger":"on_acceptance","due_date":null},{"label":"B","basis_points":5000,"trigger":"on_delivery","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '22023', 'payment_schedule_invalid', 'basis points above 10000 are rejected while drafting');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"Deposit paid","basis_points":5000,"trigger":"on_acceptance","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '23514', null, 'a label with a status word is rejected');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"PENDING approval","basis_points":5000,"trigger":"on_acceptance","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '23514', null, 'status words are matched case-insensitively');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"Settled on delivery","basis_points":5000,"trigger":"on_delivery","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '23514', null, '"settled" is rejected');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"Outstanding balance","basis_points":5000,"trigger":"on_delivery","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '23514', null, '"outstanding" is rejected');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"Overdue fee","basis_points":5000,"trigger":"on_delivery","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '23514', null, '"overdue" is rejected');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"Payment received","basis_points":5000,"trigger":"on_delivery","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '23514', null, '"received" is rejected');
select lives_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"Prepaid deposit","basis_points":5000,"trigger":"on_acceptance","due_date":null},{"label":"Unpaid remainder terms","basis_points":5000,"trigger":"on_delivery","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, 'only whole words match: "Prepaid" and "Unpaid" are allowed');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = jsonb_build_array(jsonb_build_object('label', repeat('x', 121), 'basis_points', 5000, 'trigger', 'on_acceptance', 'due_date', null))
  where quote_id = (select id from p3_q where key = 'd')$$, '23514', null, 'a 121-character label is rejected');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"  ","basis_points":5000,"trigger":"on_acceptance","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '23514', null, 'a blank label is rejected');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"Dated","basis_points":5000,"trigger":"on_date","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '22023', 'payment_schedule_invalid', 'a dated milestone needs a date');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = jsonb_build_array(jsonb_build_object('label', 'Dated', 'basis_points', 5000, 'trigger', 'on_date', 'due_date', (current_date - 1)::text))
  where quote_id = (select id from p3_q where key = 'd')$$, '22023', 'payment_schedule_invalid', 'a date before the issue date is rejected');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"Undated","basis_points":5000,"trigger":"on_delivery","due_date":"2030-01-01"}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '22023', 'payment_schedule_invalid', 'only a dated milestone may carry a date');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"A","basis_points":5000,"trigger":"on_signature","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '22023', 'payment_schedule_invalid', 'an unknown trigger is rejected');
select throws_ok($$update public.quote_payment_schedule_editor set milestones = '[{"label":"A","basis_points":5000,"trigger":"on_acceptance","due_date":null,"amount_minor":1}]'::jsonb
  where quote_id = (select id from p3_q where key = 'd')$$, '22023', 'payment_schedule_invalid', 'a client-supplied amount is rejected');
select throws_ok($$update public.quote_payment_milestones set label = 'x'$$, '42501', null, 'direct table updates are denied');
select throws_ok($$update public.quote_payment_schedule_editor set version = 99 where quote_id = (select id from p3_q where key = 'd')$$, '42501', null, 'only the milestones column is writable through the view');

-- other roles and organizations
select public.p3_claims('55555555-5555-4555-8555-555555555555');
select is(public.p3_exec_count($sql$update public.quote_payment_schedule_editor set milestones = '[]'::jsonb where quote_id = (select id from p3_q where key = 'd')$sql$), 0, 'the reviewer (no quote.edit) cannot edit a schedule');
select cmp_ok((select count(*)::integer from public.quote_payment_milestones where quote_id = (select id from p3_q where key = 'd')), '>', 0, 'the reviewer reads milestones through quote.read, like quote_items');
select public.p3_claims('44444444-4444-4444-8444-444444444444');
select is((select count(*)::integer from public.quote_payment_milestones) + (select count(*)::integer from public.quote_payment_schedule_editor), 0, 'another organization sees no schedule');
select is(public.p3_exec_count($sql$update public.quote_payment_schedule_editor set milestones = '[]'::jsonb where quote_id = (select id from p3_q where key = 'd')$sql$), 0, 'another organization cannot edit a schedule');
reset role;

-- clearing works
select public.p3_claims('11111111-1111-4111-8111-111111111111');
set local role authenticated;
select is(public.p3_exec_count($sql$update public.quote_payment_schedule_editor set milestones = '[]'::jsonb
  where quote_id = (select id from p3_q where key = 'd') and version = (select version from public.quote_payment_schedule_editor where quote_id = (select id from p3_q where key = 'd'))$sql$), 1, 'an empty array clears the schedule');
reset role;
select is((select count(*)::integer from public.quote_payment_milestones where quote_id = (select id from p3_q where key = 'd')), 0, 'no milestone rows remain after clearing');

-- -------------------------------------------------------- submit-time rules
select throws_ok($$select public.p3_make('exclusive', 0, '[{"label":"Deposit","basis_points":5000,"trigger":"on_acceptance","due_date":null},{"label":"Rest","basis_points":4000,"trigger":"on_delivery","due_date":null}]'::jsonb, true)$$, '22023', 'PAYMENT_SCHEDULE_INVALID', 'submit rejects a schedule that does not total 10000 basis points');
select throws_ok($$select public.p3_make('exclusive', 10000, '[{"label":"Deposit","basis_points":10000,"trigger":"on_acceptance","due_date":null}]'::jsonb, true)$$, '22023', 'PAYMENT_SCHEDULE_INVALID', 'submit rejects a schedule on a zero-total quote');

-- a date that was valid when edited but precedes a later issue date
create function public.p3_late_issue_date() returns void language plpgsql as $$
declare v_quote uuid; v_revision uuid;
begin
  v_quote := public.p3_make('exclusive', 0, jsonb_build_array(jsonb_build_object('label', 'Dated', 'basis_points', 10000, 'trigger', 'on_date', 'due_date', (current_date + 5)::text)), false);
  perform public.save_quote_draft(v_quote, (select version from public.quotes where id = v_quote), gen_random_uuid(), jsonb_build_object(
    'customer_id', 'a3000000-0000-4000-8000-000000000001', 'currency_code', 'INR',
    'locale', 'en-IN', 'tax_label', 'GST 18%', 'tax_mode', 'exclusive',
    'discount_bps', 0, 'issue_date', (current_date + 10), 'valid_until', (current_date + 40),
    'notes', 'p3 fixture', 'items', jsonb_build_array(jsonb_build_object('line_id',
      (select id from public.quote_items where quote_id = v_quote), 'product_id', 'a2000000-0000-4000-8000-000000000001',
      'position', 1, 'quantity_scaled', 1, 'quantity_scale', 1)), 'charges', '[]'::jsonb));
  perform public.submit_quote_revision(v_quote, (select current_revision_id from public.quotes where id = v_quote),
    (select version from public.quotes where id = v_quote), gen_random_uuid());
end;
$$;
select throws_ok($$select public.p3_late_issue_date()$$, '22023', 'PAYMENT_SCHEDULE_INVALID', 'submit rejects a dated milestone that now precedes the issue date');

-- ------------------------------------------------------ sealed v1 and v2
insert into p3_q values ('v1', public.p3_make('exclusive', 0, null, true));
insert into p3_q values ('v2', public.p3_make('exclusive', 0, public.p3_sched(), true));

select is((select snapshot_format_version from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v1')), 1, 'a quote without a schedule is sealed as format v1');
select is((select (snapshot ? 'payment_schedule')::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v1')), 'false', 'a v1 snapshot has no payment_schedule key');
select is((select snapshot_hash::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v1')),
  (select public.sha256_hex(public.canonical_json_v1(public.quote_snapshot_v1(r.id, r.calculation_fingerprint::text, r.approval_threshold_bps, r.requires_manual_approval, r.approval_reason_codes))) from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v1')),
  'a v1 quote hashes exactly as the unchanged v1 snapshot builder produces it');
select is((select snapshot_format_version from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), 2, 'a quote with a schedule is sealed as format v2');
select is((select calculation_format_version from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), 1, 'calculation format stays 1');
select is((select (calculation_document::text ~ 'payment')::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), 'false', 'the calculation document carries no schedule');
select is((select snapshot ->> 'format_version' from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), '2', 'the snapshot declares format_version 2');
select is((select array(select (e ->> 'amount_minor')::bigint from jsonb_array_elements(snapshot -> 'payment_schedule') e) from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')),
  array[660800, 396480, 264320]::bigint[], 'sealed amounts are 50% / 30% / 20% of 1,321,600');
select is((select (select sum((e ->> 'amount_minor')::bigint) from jsonb_array_elements(snapshot -> 'payment_schedule') e) = r.total_minor from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), true, 'sealed amounts sum to the total exactly');
select is((select (snapshot - 'payment_schedule') || '{"format_version": 1}'::jsonb from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')),
  (select public.quote_snapshot_v1(r.id, r.calculation_fingerprint::text, r.approval_threshold_bps, r.requires_manual_approval, r.approval_reason_codes) from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')),
  'v2 is exactly the v1 snapshot plus the schedule and the version number');
select is((select snapshot_hash::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')),
  (select public.sha256_hex(canonical_snapshot) from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), 'the snapshot hash covers the exact canonical bytes including the schedule');
select is((select (snapshot::text ~* '(cost|margin|paid|received)')::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), 'false', 'the v2 snapshot has no cost, margin or payment-status text');
select throws_ok($$update public.quote_revisions set snapshot_format_version = 1 where id = (select current_revision_id from public.quotes where id = (select id from p3_q where key = 'v2'))$$, null, null, 'a sealed revision cannot be re-labelled as v1');

-- ------------------------------------------------ issue, share, accept, verify
select public.p3_issue((select id from p3_q where key = 'v1'));
select public.p3_issue((select id from p3_q where key = 'v2'));
select public.p3_share((select id from p3_q where key = 'v1'));
select public.p3_share((select id from p3_q where key = 'v2'));
create temporary table p3_open (key text primary key, response jsonb);
grant all on p3_open to service_role;
set local role service_role;
insert into p3_open select 'v1', public.broker_open_quote((select selector from p3_link where quote_id = (select id from p3_q where key = 'v1')), (select secret from p3_link where quote_id = (select id from p3_q where key = 'v1')), extensions.digest(convert_to('p3-open-v1', 'UTF8'), 'sha256'));
insert into p3_open select 'v2', public.broker_open_quote((select selector from p3_link where quote_id = (select id from p3_q where key = 'v2')), (select secret from p3_link where quote_id = (select id from p3_q where key = 'v2')), extensions.digest(convert_to('p3-open-v2', 'UTF8'), 'sha256'));
reset role;
select is((select response #>> '{value,snapshot,format_version}' from p3_open where key = 'v2'), '2', 'the broker returns the v2 snapshot to the buyer');
select is((select jsonb_array_length(response #> '{value,snapshot,payment_schedule}') from p3_open where key = 'v2'), 3, 'the buyer snapshot carries the schedule');
select is((select response #>> '{value,snapshot,format_version}' from p3_open where key = 'v1'), '1', 'a v1 quote still opens as v1');
select is((select (response::text ~* '(cost|margin|paid|received|pending|outstanding|overdue|settled)')::text from p3_open where key = 'v2'), 'false', 'the buyer response has no cost, margin or payment-status wording');
set local role service_role;
select is((public.broker_accept_quote((select selector from p3_link where quote_id = (select id from p3_q where key = 'v2')), (select secret from p3_link where quote_id = (select id from p3_q where key = 'v2')),
  extensions.digest(convert_to('p3-accept-v2', 'UTF8'), 'sha256'), gen_random_uuid(), 'Buyer Two', null, 1::smallint)->>'status'), 'ok', 'a v2 revision can be accepted');
select is((public.broker_accept_quote((select selector from p3_link where quote_id = (select id from p3_q where key = 'v1')), (select secret from p3_link where quote_id = (select id from p3_q where key = 'v1')),
  extensions.digest(convert_to('p3-accept-v1', 'UTF8'), 'sha256'), gen_random_uuid(), 'Buyer One', null, 1::smallint)->>'status'), 'ok', 'a v1 revision can still be accepted');
reset role;
select is((select snapshot_format_version from public.quote_acceptances where quote_id = (select id from p3_q where key = 'v2')), 2, 'the v2 acceptance records snapshot format 2');
select is((select snapshot_format_version from public.quote_acceptances where quote_id = (select id from p3_q where key = 'v1')), 1, 'the v1 acceptance records snapshot format 1');
select is((select a.snapshot_hash::text from public.quote_acceptances a where a.quote_id = (select id from p3_q where key = 'v2')),
  (select r.snapshot_hash::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), 'the v2 acceptance binds the sealed v2 snapshot hash');
select is((select a.acceptance_statement_document ->> 'snapshot_hash' from public.quote_acceptances a where a.quote_id = (select id from p3_q where key = 'v2')),
  (select r.snapshot_hash::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), 'the signed statement binds the v2 hash');
select is((select acceptance_statement from public.quote_acceptances where quote_id = (select id from p3_q where key = 'v2')),
  (select acceptance_statement from public.quote_acceptances where quote_id = (select id from p3_q where key = 'v1')), 'the acceptance statement text is identical for v1 and v2');
create temporary table p3_code (key text primary key, code text);
grant all on p3_code to service_role;
insert into p3_code select 'v1', verification_code::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v1');
insert into p3_code select 'v2', verification_code::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2');
create temporary table p3_verify (key text primary key, response jsonb);
grant all on p3_verify to service_role;
set local role service_role;
insert into p3_verify select 'v1', public.broker_verify_quote((select code from p3_code where key = 'v1'), extensions.digest(convert_to('p3-verify-v1', 'UTF8'), 'sha256'));
insert into p3_verify select 'v2', public.broker_verify_quote((select code from p3_code where key = 'v2'), extensions.digest(convert_to('p3-verify-v2', 'UTF8'), 'sha256'));
reset role;
select is((select response #>> '{value,verified}' from p3_verify where key = 'v1'), 'true', 'an existing v1 acceptance still verifies');
select is((select response #>> '{value,snapshot_hash}' from p3_verify where key = 'v2'),
  (select r.snapshot_hash::text from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'v2')), 'a v2 acceptance verifies against its snapshot hash');

-- ------------------------------------------------------ successor revisions
insert into p3_q values ('r2', public.p3_make('exclusive', 0, public.p3_sched(), true));
select public.p3_issue((select id from p3_q where key = 'r2'));
insert into p3_q values ('r1', public.p3_make('exclusive', 0, null, true));
select public.p3_issue((select id from p3_q where key = 'r1'));
create function public.p3_begin(p_quote uuid) returns void language plpgsql as $$
begin
  perform public.p3_claims('11111111-1111-4111-8111-111111111111');
  perform public.begin_quote_revision(p_quote, (select current_revision_id from public.quotes where id = p_quote),
    (select version from public.quotes where id = p_quote), gen_random_uuid());
end;
$$;
select public.p3_begin((select id from p3_q where key = 'r2'));
select is((select array_agg(label || ':' || basis_points order by position) from public.quote_payment_milestones where quote_id = (select id from p3_q where key = 'r2')),
  array['Deposit:5000', 'On delivery:3000', 'Final instalment:2000'], 'a successor revision restores the sealed schedule of its base');
select public.p3_claims('11111111-1111-4111-8111-111111111111');
select lives_ok($$select public.submit_quote_revision((select id from p3_q where key = 'r2'), (select current_revision_id from public.quotes where id = (select id from p3_q where key = 'r2')),
  (select version from public.quotes where id = (select id from p3_q where key = 'r2')), gen_random_uuid())$$, 'the successor submits');
select is((select array[snapshot_format_version::text, snapshot #>> '{payment_schedule,0,amount_minor}'] from public.quote_revisions r join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'r2')),
  array['2', '660800'], 'the successor is sealed as v2 with the same schedule');

select public.p3_begin((select id from p3_q where key = 'r1'));
select is((select count(*)::integer from public.quote_payment_milestones where quote_id = (select id from p3_q where key = 'r1')), 0, 'a successor of a v1 revision starts without a schedule');
set local role authenticated;
select public.p3_claims('11111111-1111-4111-8111-111111111111');
select is(public.p3_exec_count($sql$update public.quote_payment_schedule_editor set milestones = '[{"label":"Deposit","basis_points":10000,"trigger":"on_acceptance","due_date":null}]'::jsonb
  where quote_id = (select id from p3_q where key = 'r1') and version = (select version from public.quote_payment_schedule_editor where quote_id = (select id from p3_q where key = 'r1'))$sql$), 1, 'a schedule can be added in a later revision');
reset role;
select public.p3_claims('11111111-1111-4111-8111-111111111111');
select lives_ok($$select public.submit_quote_revision((select id from p3_q where key = 'r1'), (select current_revision_id from public.quotes where id = (select id from p3_q where key = 'r1')),
  (select version from public.quotes where id = (select id from p3_q where key = 'r1')), gen_random_uuid())$$, 'the revision that adds a schedule submits');
select is((select array[r.snapshot_format_version::text, ((r.snapshot #>> '{quote,parent_snapshot_hash}') = parent.snapshot_hash::text)::text] from public.quote_revisions r
    join public.quote_revisions parent on parent.id = r.parent_revision_id
    join public.quotes q on q.current_revision_id = r.id where q.id = (select id from p3_q where key = 'r1')),
  array['2', 'true'], 'a v2 revision can follow a v1 parent and links to its hash');

select * from finish();
rollback;
