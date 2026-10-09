begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(141);

-- ---------------------------------------------------------------- fixtures
create function public.p6_claims(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;

create temporary table p6_q (key text primary key, quote_id uuid not null, revision_id uuid not null,
  number text not null, selector uuid, secret text, link_id uuid);
grant all on p6_q to authenticated, anon, service_role;

-- An organization-A quote (product PCA-220 x 1) taken to the requested stage as the operator.
-- p_link_by: the user who creates the share link ('issued' stage and later).
create function public.p6_make(p_key text, p_stage text, p_discount integer, p_link_by uuid)
returns void language plpgsql as $$
declare
  v_created jsonb; v_quote uuid; v_revision uuid; v_link jsonb;
begin
  perform public.p6_claims('11111111-1111-4111-8111-111111111111');
  v_created := public.create_verified_quote_draft(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3000000-0000-4000-8000-000000000001',
    'INR', 'en-IN', 'GST 18%', 'exclusive'::public.tax_price_basis,
    current_date, (current_date + 31), gen_random_uuid());
  v_quote := (v_created ->> 'id')::uuid;
  v_revision := (v_created ->> 'current_revision_id')::uuid;
  perform public.save_quote_draft(v_quote, 1, gen_random_uuid(), jsonb_build_object(
    'customer_id', 'a3000000-0000-4000-8000-000000000001', 'currency_code', 'INR',
    'locale', 'en-IN', 'tax_label', 'GST 18%', 'tax_mode', 'exclusive',
    'discount_bps', p_discount, 'issue_date', current_date, 'valid_until', (current_date + 31),
    'notes', 'p6 fixture', 'items', jsonb_build_array(jsonb_build_object('line_id', null,
      'product_id', 'a2000000-0000-4000-8000-000000000001', 'position', 1, 'quantity_scaled', 1, 'quantity_scale', 1)),
    'charges', '[]'::jsonb));
  insert into p6_q (key, quote_id, revision_id, number)
  values (p_key, v_quote, v_revision, (select number from public.quotes where id = v_quote));
  if p_stage in ('waiting', 'issued') then
    perform public.submit_quote_revision(v_quote, v_revision,
      (select version from public.quotes where id = v_quote), gen_random_uuid());
  end if;
  if p_stage = 'issued' then
    perform public.issue_quote_revision(v_quote, v_revision,
      (select version from public.quotes where id = v_quote), gen_random_uuid());
    perform public.p6_claims(p_link_by);
    v_link := public.create_quote_share_link(v_quote, v_revision,
      (select version from public.quotes where id = v_quote), 'buyer-' || p_key || '@example.test',
      (now() + interval '18 days'), gen_random_uuid());
    update p6_q set selector = (v_link ->> 'selector')::uuid, secret = v_link ->> 'secret',
      link_id = (v_link ->> 'link_id')::uuid where key = p_key;
  end if;
end;
$$;

create function public.p6_exec_count(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin execute p_sql; get diagnostics n = row_count; return n; end;
$$;
grant execute on function public.p6_exec_count(text) to authenticated, anon;

create function public.p6_outbox(p_key text, p_kind text) returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.email_outbox o join p6_q q on q.quote_id = o.quote_id
  where q.key = p_key and (p_kind is null or o.kind = p_kind)
$$;

-- Counts of people the approval notice should reach: active quote.approve holders, minus the operator.
create temporary table p6_managers as
select m.user_id from public.organization_memberships m
where m.organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and m.status = 'active'
  and m.user_id <> '11111111-1111-4111-8111-111111111111'
  and exists (select 1 from public.role_capabilities rc where rc.role_id = m.role_id and rc.capability_key = 'quote.approve');
grant all on p6_managers to authenticated;

-- issuer operator, link by manager (two internal recipients); issuer = link creator (one); two for later.
select public.p6_make('a', 'issued', 0, '22222222-2222-4222-8222-222222222222');
select public.p6_make('b', 'issued', 0, '11111111-1111-4111-8111-111111111111');
select public.p6_make('c', 'waiting', 1500, null);
select public.p6_make('d', 'issued', 0, '22222222-2222-4222-8222-222222222222');
select public.p6_make('e', 'issued', 0, '11111111-1111-4111-8111-111111111111');
select public.p6_make('f', 'issued', 0, '11111111-1111-4111-8111-111111111111');
select public.p6_make('draft', 'draft', 0, null);

-- ------------------------------------------------------------- privileges
select ok(not has_table_privilege('authenticated', 'public.email_outbox', 'select')
  and not has_table_privilege('authenticated', 'public.email_outbox', 'insert')
  and not has_table_privilege('authenticated', 'public.email_outbox', 'update')
  and not has_table_privilege('authenticated', 'public.email_outbox', 'delete')
  and not has_table_privilege('authenticated', 'public.email_outbox', 'truncate'), 'authenticated has no privilege on the outbox table');
select ok(not has_table_privilege('anon', 'public.email_outbox', 'select') and not has_table_privilege('anon', 'public.email_outbox', 'insert'), 'anon has no privilege on the outbox table');
select ok(not has_table_privilege('service_role', 'public.email_outbox', 'select')
  and not has_table_privilege('service_role', 'public.email_outbox', 'insert')
  and not has_table_privilege('service_role', 'public.email_outbox', 'update')
  and not has_table_privilege('service_role', 'public.email_outbox', 'delete'), 'even service_role writes the outbox only through its routines');
select ok(not has_table_privilege('authenticated', 'public.email_outbox_attempts', 'select')
  and not has_table_privilege('anon', 'public.email_outbox_attempts', 'select')
  and not has_table_privilege('service_role', 'public.email_outbox_attempts', 'insert'), 'the attempts log is closed to every application role');
select ok((select relrowsecurity from pg_class where oid = 'public.email_outbox'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.email_outbox_attempts'::regclass), 'both tables have RLS enabled');
select ok(has_function_privilege('service_role', 'public.claim_email_outbox(integer,integer)', 'execute')
  and has_function_privilege('service_role', 'public.outbox_mint_share_link(uuid,integer)', 'execute')
  and has_function_privilege('service_role', 'public.complete_email_outbox(uuid,integer,text,text,text)', 'execute'), 'service_role executes the three worker routines');
select ok(not has_function_privilege('authenticated', 'public.claim_email_outbox(integer,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.outbox_mint_share_link(uuid,integer)', 'execute')
  and not has_function_privilege('authenticated', 'public.complete_email_outbox(uuid,integer,text,text,text)', 'execute')
  and not has_function_privilege('anon', 'public.claim_email_outbox(integer,integer)', 'execute')
  and not has_function_privilege('anon', 'public.outbox_mint_share_link(uuid,integer)', 'execute')
  and not has_function_privilege('anon', 'public.complete_email_outbox(uuid,integer,text,text,text)', 'execute')
  and not has_function_privilege('public', 'public.claim_email_outbox(integer,integer)', 'execute'), 'browser roles and PUBLIC cannot execute the worker routines');
select ok(not has_function_privilege('authenticated', 'public.outbox_insert(uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.outbox_insert(uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid)', 'execute')
  and not has_function_privilege('service_role', 'public.outbox_insert(uuid,uuid,uuid,text,text,uuid,text,jsonb,timestamptz,uuid)', 'execute'), 'nobody can call the insert helper directly');
select ok(not has_function_privilege('authenticated', 'public.enqueue_buyer_response_email()', 'execute')
  and not has_function_privilege('authenticated', 'public.enqueue_approval_waiting_email()', 'execute')
  and not has_function_privilege('authenticated', 'public.enqueue_quote_email_to_buyer()', 'execute')
  and not has_function_privilege('anon', 'public.enqueue_quote_email_to_buyer()', 'execute')
  and not has_function_privilege('service_role', 'public.enqueue_buyer_response_email()', 'execute'), 'trigger functions are executable by no application role');
select ok(has_table_privilege('authenticated', 'public.quote_email_activity', 'select')
  and not has_table_privilege('anon', 'public.quote_email_activity', 'select')
  and has_table_privilege('authenticated', 'public.quote_buyer_email_requests', 'insert')
  and not has_table_privilege('anon', 'public.quote_buyer_email_requests', 'insert'), 'browser access is exactly the two views');

-- ------------------------------------------- (c) waiting for approval -> managers
select ok((select count(*) from p6_managers) >= 1, 'fixture: the organization has at least one manager');
select is(public.p6_outbox('c', 'approval_waiting'), (select count(*)::integer from p6_managers), 'a quote waiting for approval queues one email per active approver');
select is((select count(*)::integer from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'c')
  and o.recipient_user_id = '11111111-1111-4111-8111-111111111111'), 0, 'the submitter is not notified');
select is((select count(*)::integer from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'c')
  and o.recipient_user_id = '55555555-5555-4555-8555-555555555555'), 0, 'a reviewer holds no approve capability and is not notified');
select is((select count(*)::integer from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'c')
  and o.recipient_user_id not in (select user_id from p6_managers)), 0, 'every recipient is an approver');
select is((select count(distinct dedupe_key)::integer from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'c')), public.p6_outbox('c', 'approval_waiting'), 'each approver has a distinct deterministic key');
select ok((select bool_and(o.dedupe_key like 'approval-waiting:' || o.revision_id::text || ':%:' || o.recipient_user_id::text) from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'c')), 'approval keys are revision, submission time and recipient');
select is((select payload ->> 'quote_number' from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'c') limit 1), (select number from p6_q where key = 'c'), 'the payload carries the quote number from the sealed snapshot');
select is((select count(*)::integer from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'c')
  and (o.payload::text ~* '(cost|margin|reason|threshold)')), 0, 'the approval payload names no cost, margin, reason or threshold');
select is(public.p6_outbox('a', 'approval_waiting') + public.p6_outbox('b', 'approval_waiting'), 0, 'a quote that auto-approves queues no approval email');
select is((select status from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'c') limit 1), 'queued', 'new rows are queued');

-- ------------------------------------------------------ (b) buyer response
set local role service_role;
select is(public.broker_record_quote_event('change_requested',
  (select selector from p6_q where key = 'a'), (select secret from p6_q where key = 'a'),
  extensions.digest(convert_to('p6-subject-a', 'UTF8'), 'sha256'),
  'b6000000-0000-4000-8000-000000000001',
  E'Please change\tdelivery terms\nline two ' || repeat('x', 700))->>'status', 'ok', 'fixture: the buyer requests changes through the broker');
reset role;
select is(public.p6_outbox('a', 'buyer_change_requested'), 2, 'a change request notifies the revision issuer and the link creator, once each');
select is((select array_agg(o.recipient_user_id order by o.recipient_user_id) from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'a') and o.kind = 'buyer_change_requested'),
  array['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']::uuid[], 'recipients are the issuer (operator) and the link creator (manager)');
select is((select array_agg(o.recipient_email order by o.recipient_email) from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'a') and o.kind = 'buyer_change_requested'),
  (select array_agg(lower(u.email) order by lower(u.email)) from auth.users u where u.id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')), 'addresses come from the members themselves, never from the buyer');
select ok((select bool_and(length(o.payload ->> 'buyer_message') = 500) from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'a') and o.kind = 'buyer_change_requested'), 'the buyer message is capped at 500 characters');
select ok((select bool_and(o.payload ->> 'buyer_message' !~ '[[:cntrl:]]') from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'a') and o.kind = 'buyer_change_requested'), 'control characters are stripped from the buyer message');
select is((select count(*)::integer from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'a') and o.recipient_email like 'buyer-%'), 0, 'the buyer is never an internal recipient');
select is((select dedupe_key from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'a') and o.recipient_user_id = '11111111-1111-4111-8111-111111111111'),
  'buyer-response:' || (select id::text from public.quote_recipient_events where quote_id = (select quote_id from p6_q where key = 'a')) || ':11111111-1111-4111-8111-111111111111', 'the key is event and recipient');
set local role service_role;
select is(public.broker_record_quote_event('change_requested',
  (select selector from p6_q where key = 'a'), (select secret from p6_q where key = 'a'),
  extensions.digest(convert_to('p6-subject-a', 'UTF8'), 'sha256'),
  'b6000000-0000-4000-8000-000000000001',
  E'Please change\tdelivery terms\nline two ' || repeat('x', 700))->>'status', 'ok', 'a replayed buyer request is accepted idempotently');
select is(public.broker_record_quote_event('declined',
  (select selector from p6_q where key = 'a'), (select secret from p6_q where key = 'a'),
  extensions.digest(convert_to('p6-subject-a2', 'UTF8'), 'sha256'),
  'b6000000-0000-4000-8000-000000000002', null)->>'status', 'already_responded', 'a second response is refused by the broker');
reset role;
select is(public.p6_outbox('a', null), 2, 'replays and refused responses queue nothing more');

set local role service_role;
select is(public.broker_record_quote_event('declined',
  (select selector from p6_q where key = 'b'), (select secret from p6_q where key = 'b'),
  extensions.digest(convert_to('p6-subject-b', 'UTF8'), 'sha256'),
  'b6000000-0000-4000-8000-000000000003', null)->>'status', 'ok', 'fixture: the buyer declines');
reset role;
select is(public.p6_outbox('b', 'buyer_declined'), 1, 'when issuer and link creator are one person there is one email');
select ok((select not (payload ? 'buyer_message') from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'b')), 'a decline carries no message (the broker accepts none)');

-- A suspended link creator is not notified; acceptance carries no buyer message.
update public.organization_memberships set status = 'suspended'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '22222222-2222-4222-8222-222222222222';
set local role service_role;
select is(public.broker_accept_quote(
  (select selector from p6_q where key = 'd'), (select secret from p6_q where key = 'd'),
  extensions.digest(convert_to('p6-subject-d', 'UTF8'), 'sha256'),
  'b6000000-0000-4000-8000-000000000004', 'Buyer Person', null, 1::smallint)->>'status', 'ok', 'fixture: the buyer accepts');
reset role;
select is(public.p6_outbox('d', 'buyer_accepted'), 1, 'only active members are notified of an acceptance');
select is((select recipient_user_id from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'd')), '11111111-1111-4111-8111-111111111111'::uuid, 'the notified member is the active issuer');
select ok((select not (payload ? 'buyer_message') from public.email_outbox o where o.quote_id = (select quote_id from p6_q where key = 'd')), 'an acceptance carries no buyer message');
update public.organization_memberships set status = 'active'
where organization_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '22222222-2222-4222-8222-222222222222';

-- A broken recipient never blocks the buyer's response.
update auth.users set email = 'not an address' where id = '11111111-1111-4111-8111-111111111111';
set local role service_role;
select is(public.broker_record_quote_event('declined',
  (select selector from p6_q where key = 'e'), (select secret from p6_q where key = 'e'),
  extensions.digest(convert_to('p6-subject-e', 'UTF8'), 'sha256'),
  'b6000000-0000-4000-8000-000000000005', null)->>'status', 'ok', 'the buyer response succeeds even if the notification cannot be queued');
reset role;
select is((select count(*)::integer from public.quote_recipient_events where quote_id = (select quote_id from p6_q where key = 'e')), 1, 'the commercial event is recorded');
select is(public.p6_outbox('e', null), 0, 'and no malformed row was queued');
update auth.users set email = 'operator@tender.local' where id = '11111111-1111-4111-8111-111111111111';

-- ------------------------------------------------- (a) issuer -> buyer (the view)
create temporary table p6_op_email as select email from auth.users where id = '11111111-1111-4111-8111-111111111111';
grant all on p6_op_email to authenticated;
create temporary table p6_internal as select count(*)::integer as n from public.email_outbox where audience = 'internal';
grant all on p6_internal to authenticated;
set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
select lives_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), '  Buyer.One@Example.Test ', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000001'
  from p6_q where key = 'e'$$, 'operator queues an email to the buyer');
reset role;
select is((select count(*)::integer from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001'), 1, 'one outbox row is queued with the command key');
select is((select recipient_email from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001'), 'buyer.one@example.test', 'the address is normalised');
select is((select status || '/' || kind || '/' || audience from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001'), 'queued/quote_to_buyer/buyer', 'it is a queued buyer email');
select is((select created_by from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001'), '11111111-1111-4111-8111-111111111111'::uuid, 'the acting user is recorded');
select is((select share_link_id from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001'), null, 'no link exists yet: it is minted at delivery');
select is((select count(*)::integer from public.quote_share_links where quote_id = (select quote_id from p6_q where key = 'e')), 1, 'queuing created no share link (only the fixture link exists)');
select is((select payload ->> 'quote_number' from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001'), (select number from p6_q where key = 'e'), 'the payload has the quote number');
select ok((select payload ->> 'seller_name' is not null and payload ->> 'valid_until' is not null and payload ->> 'time_zone' is not null from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001'), 'the payload has seller name, validity and zone from the sealed snapshot');
select is((select count(*)::integer from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001' and payload::text ~* '(secret|token|selector)'), 0, 'the payload holds no secret material');

set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
select lives_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'other@example.test', now() + interval '6 days', 'c6000000-0000-4000-8000-000000000001'
  from p6_q where key = 'e'$$, 'the same command replays without error');
reset role;
select is((select count(*)::integer from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001'), 1, 'a replayed command queues nothing more');
select is(public.p6_outbox('e', 'quote_to_buyer'), 1, 'and exactly one buyer email exists for the quote');
set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'x@example.test', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000001'
  from p6_q where key = 'b'$$, '22023', 'command_id_conflict', 'a command id cannot be reused for another quote');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, 1, 'x@example.test', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000010'
  from p6_q where key = 'e'$$, '40001', 'revision_stale', 'a stale version is refused');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'x@example.test', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000011'
  from p6_q where key = 'draft'$$, '55000', 'revision_not_issued', 'a revision that is not issued is refused');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'x@example.test', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000012'
  from p6_q where key = 'd'$$, '55000', 'quote_already_accepted', 'an accepted quotation cannot be emailed again');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'x@example.test', now() + interval '400 days', 'c6000000-0000-4000-8000-000000000013'
  from p6_q where key = 'e'$$, '22023', 'share_expiry_invalid', 'an expiry beyond the quotation validity is refused');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'x@example.test', now() - interval '1 day', 'c6000000-0000-4000-8000-000000000014'
  from p6_q where key = 'e'$$, '22023', 'share_expiry_invalid', 'a past expiry is refused');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'not-an-address', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000015'
  from p6_q where key = 'e'$$, '22023', 'recipient_email_invalid', 'a malformed address is refused');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'x@example.test', now() + interval '5 days', null
  from p6_q where key = 'e'$$, '22023', 'command_id_required', 'a command id is required');

select public.p6_claims('55555555-5555-4555-8555-555555555555');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'x@example.test', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000016'
  from p6_q where key = 'e'$$, '42501', 'quote_share_forbidden', 'a reviewer cannot queue buyer email');
select public.p6_claims('44444444-4444-4444-8444-444444444444');
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'x@example.test', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000017'
  from p6_q where key = 'e'$$, '42501', 'quote_share_forbidden', 'a member of another organization cannot queue it');
reset role;
set local role anon;
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  values (gen_random_uuid(), gen_random_uuid(), 1, 'x@example.test', now() + interval '1 day', gen_random_uuid())$$, '42501', null, 'anon cannot insert');
reset role;
set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
select throws_ok($$insert into public.email_outbox (organization_id, quote_id, revision_id, kind, recipient_email, dedupe_key, payload)
  values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'buyer_accepted', 'a@b.test', 'forged-key-1', '{}')$$, '42501', null, 'no browser role can insert an arbitrary email');
select throws_ok($$select * from public.email_outbox$$, '42501', null, 'no browser role can read the table');
select throws_ok($$update public.email_outbox set status = 'sent'$$, '42501', null, 'no browser role can update the table');
select throws_ok($$delete from public.email_outbox$$, '42501', null, 'no browser role can delete from the table');
select throws_ok($$select * from public.email_outbox_attempts$$, '42501', null, 'no browser role can read the attempts log');
reset role;
-- abuse bound: ten per quote per hour
set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
do $$
declare i integer;
begin
  for i in 2..10 loop
    insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
    select quote_id, revision_id, (select version from public.quotes where id = quote_id),
      'bulk' || i || '@example.test', now() + interval '5 days', ('c6000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid
    from p6_q where key = 'e';
  end loop;
end;
$$;
select throws_ok($$insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
  select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'eleventh@example.test', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000199'
  from p6_q where key = 'e'$$, '54000', 'email_rate_limited', 'the eleventh buyer email for a quote in an hour is refused');
reset role;

-- ------------------------------------------------ reading: the Emails view
set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
select is((select count(*)::integer from public.quote_email_activity where quote_id = (select quote_id from p6_q where key = 'e') and audience = 'buyer'), 10, 'operator sees the buyer emails of the quote');
select ok((select bool_and(recipient_email is not null and recipient_label = recipient_email) from public.quote_email_activity where audience = 'buyer'), 'buyer rows show the buyer address');
select is((select count(*)::integer from public.quote_email_activity where audience = 'internal'), (select n from p6_internal), 'operator sees every internal row');
select ok((select bool_and(recipient_email is null and recipient_label = 'Team notification') from public.quote_email_activity where audience = 'internal'), 'internal rows are labelled "Team notification" with no address');
select is((select display_status from public.quote_email_activity where quote_id = (select quote_id from p6_q where key = 'c') limit 1), 'queued', 'queued rows display as queued');

select public.p6_claims('55555555-5555-4555-8555-555555555555');
select ok((select count(*) from public.quote_email_activity) > 0, 'a reviewer can read the Emails list');
select is((select count(*)::integer from public.quote_email_activity where audience = 'internal' and recipient_email is not null), 0, 'a reviewer sees no internal address column value');
select ok(not exists (select 1 from public.quote_email_activity a where a.audience = 'internal' and to_jsonb(a)::text ~* '(@|tender\.local)'), 'no internal row of the view contains any address at all, for the reviewer');
select ok(not exists (select 1 from public.quote_email_activity a where a.audience = 'internal' and to_jsonb(a)::text like '%' || (select email from p6_op_email) || '%'), 'the operator''s address is not in any internal row');
select throws_ok($$select recipient_email from public.email_outbox$$, '42501', null, 'the reviewer cannot read the base table column either');
select throws_ok($$select payload from public.quote_buyer_email_requests$$, '42703', null, 'the request view exposes no payload');
select public.p6_claims('44444444-4444-4444-8444-444444444444');
select is((select count(*)::integer from public.quote_email_activity), 0, 'another organization sees no emails');
reset role;
set local role anon;
select throws_ok($$select * from public.quote_email_activity$$, '42501', null, 'anon cannot read the Emails list');
reset role;

-- ------------------------------------------------------------------ guards
select throws_ok($$update public.email_outbox set recipient_email = 'other@example.test'$$, '55000', 'email_outbox_content_immutable', 'the owner cannot change a recipient');
select throws_ok($$update public.email_outbox set payload = '{}'$$, '55000', 'email_outbox_content_immutable', 'the owner cannot change a payload');
select throws_ok($$delete from public.email_outbox$$, '55000', 'email_outbox_immutable', 'rows are never deleted');
select throws_ok($$truncate public.email_outbox cascade$$, '55000', 'email_outbox_immutable', 'the table is never truncated');
select throws_ok($$insert into public.email_outbox (organization_id, quote_id, revision_id, kind, recipient_email, dedupe_key, payload)
  values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'buyer_accepted', 'a@b.test', 'secret-payload-1', '{"secret":"x"}')$$, '23514', null, 'a payload cannot carry a secret key');
select throws_ok($$insert into public.email_outbox (organization_id, quote_id, revision_id, kind, recipient_email, dedupe_key, payload)
  values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'buyer_accepted', 'A@B.test', 'upper-case-1', '{}')$$, '23514', null, 'addresses must be lower case');
select throws_ok($$insert into public.email_outbox (organization_id, quote_id, revision_id, kind, recipient_email, dedupe_key, payload)
  values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'newsletter', 'a@b.test', 'bad-kind-1', '{}')$$, '23514', null, 'kinds are a closed list');
select throws_ok($$insert into public.email_outbox (organization_id, quote_id, revision_id, kind, recipient_email, dedupe_key, payload)
  select organization_id, quote_id, revision_id, kind, recipient_email, dedupe_key, payload from public.email_outbox limit 1$$, '23505', null, 'the dedupe key is unique');

-- --------------------------------------------------------------- the worker
create temporary table p6_claim (key text primary key, rows jsonb);
grant all on p6_claim to service_role;
-- Only the buyer email of fixture e and the internal rows are due. Isolate one buyer row.
create temporary table p6_target as
select id from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000001';
grant all on p6_target to service_role;
-- Put everything else out of the way so claims are deterministic.
update public.email_outbox set next_attempt_at = now() + interval '1 day' where id <> (select id from p6_target);

set local role service_role;
select throws_ok($$select public.claim_email_outbox(0, 60)$$, '22023', 'outbox_claim_invalid', 'a claim needs a positive limit');
select throws_ok($$select public.claim_email_outbox(5, 5)$$, '22023', 'outbox_claim_invalid', 'a claim needs a sensible lease');
insert into p6_claim select 'one', public.claim_email_outbox(10, 60);
select is(jsonb_array_length((select rows from p6_claim where key = 'one')), 1, 'only the due row is claimed');
select is((select rows -> 0 ->> 'attempt_no' from p6_claim where key = 'one'), '1', 'the first claim is attempt 1');
select is((select rows -> 0 ->> 'kind' from p6_claim where key = 'one'), 'quote_to_buyer', 'the claim carries the kind');
select is(jsonb_array_length(public.claim_email_outbox(10, 60)), 0, 'a leased row is not claimed twice');

select is(public.outbox_mint_share_link((select id from p6_target), 2)->>'status', 'ignored', 'minting for a different attempt number is ignored');
create temporary table p6_mint (key text primary key, result jsonb);
grant all on p6_mint to service_role;
insert into p6_mint select 'first', public.outbox_mint_share_link((select id from p6_target), 1);
select is((select result ->> 'status' from p6_mint where key = 'first'), 'minted', 'the worker mints the buyer link at delivery');
select ok((select length(result ->> 'secret') = 43 and (result ->> 'selector')::uuid is not null from p6_mint where key = 'first'), 'it returns a 43-character secret and a selector');
reset role;
select is((select encode(token_hash, 'hex') from public.quote_share_links where selector = (select (result ->> 'selector')::uuid from p6_mint where key = 'first')),
  encode(extensions.digest(convert_to((select result ->> 'secret' from p6_mint where key = 'first'), 'UTF8'), 'sha256'), 'hex'), 'only the SHA-256 of the secret is stored');
select is((select count(*)::integer from public.email_outbox where to_jsonb(email_outbox)::text like '%' || (select result ->> 'secret' from p6_mint where key = 'first') || '%'), 0, 'the secret appears nowhere in the outbox');
select is((select recipient_email from public.quote_share_links where selector = (select (result ->> 'selector')::uuid from p6_mint where key = 'first')), 'buyer.one@example.test', 'the link is bound to the queued recipient');
select is((select created_by from public.quote_share_links where selector = (select (result ->> 'selector')::uuid from p6_mint where key = 'first')), '11111111-1111-4111-8111-111111111111'::uuid, 'the link is created by the user who queued the email');
select is((select share_link_id from public.email_outbox where id = (select id from p6_target)), (select id from public.quote_share_links where selector = (select (result ->> 'selector')::uuid from p6_mint where key = 'first')), 'the outbox row remembers its link');

-- A failed attempt backs off; a retry mints a new link and revokes the previous one.
set local role service_role;
select is(public.complete_email_outbox((select id from p6_target), 2, 'retry', null, 'provider_unavailable')->>'status', 'ignored', 'a stale completion is ignored');
select is(public.complete_email_outbox((select id from p6_target), 1, 'retry', null, 'provider_unavailable')->>'status', 'retry_wait', 'a retryable failure waits');
reset role;
select ok((select next_attempt_at between now() + interval '45 seconds' and now() + interval '75 seconds' from public.email_outbox where id = (select id from p6_target)), 'the first backoff is about one minute');
select is((select last_error_code from public.email_outbox where id = (select id from p6_target)), 'provider_unavailable', 'the error is a short code');
select is((select outcome from public.email_outbox_attempts where outbox_id = (select id from p6_target) and attempt_no = 1), 'retry', 'the attempt is recorded');
update public.email_outbox set next_attempt_at = now() - interval '1 second' where id = (select id from p6_target);
set local role service_role;
select is(jsonb_array_length(public.claim_email_outbox(10, 60)), 1, 'a due retry is claimed again');
insert into p6_mint select 'second', public.outbox_mint_share_link((select id from p6_target), 2);
reset role;
select is((select disabled_reason::text from public.quote_share_links where selector = (select (result ->> 'selector')::uuid from p6_mint where key = 'first')), 'revoked', 'the first attempt''s link is revoked');
select is((select disabled_at is null from public.quote_share_links where selector = (select (result ->> 'selector')::uuid from p6_mint where key = 'second')), true, 'the second link is live');
set local role service_role;
select is(public.complete_email_outbox((select id from p6_target), 2, 'sent', 'provider-msg-1', null)->>'status', 'sent', 'a delivered email becomes sent');
reset role;
select is((select status || '/' || provider_message_id || '/' || (sent_at is not null)::text from public.email_outbox where id = (select id from p6_target)), 'sent/provider-msg-1/true', 'sent rows keep the provider message id');
select throws_ok($$update public.email_outbox set status = 'queued' where status = 'sent'$$, '55000', 'email_outbox_terminal', 'a sent row is final');
select is((select count(*)::integer from public.email_outbox_attempts where outbox_id = (select id from p6_target)), 2, 'two attempts are on record');

-- Dead-lettering after the maximum number of attempts.
create temporary table p6_dead as
select id from public.email_outbox where audience = 'internal' order by id limit 1;
grant all on p6_dead to service_role, authenticated;
update public.email_outbox set next_attempt_at = now() - interval '1 second' where id = (select id from p6_dead);
do $$
declare i integer; v_id uuid := (select id from p6_dead); v_rows jsonb; v_status text;
begin
  for i in 1..6 loop
    v_rows := public.claim_email_outbox(1, 60);
    if jsonb_array_length(v_rows) <> 1 or (v_rows -> 0 ->> 'id')::uuid <> v_id then
      raise exception 'expected the row to be claimed on attempt %', i;
    end if;
    v_status := public.complete_email_outbox(v_id, i, 'retry', null, 'provider_unavailable') ->> 'status';
    update public.email_outbox set next_attempt_at = now() - interval '1 second' where id = v_id and status = 'retry_wait';
  end loop;
  if v_status <> 'dead' then raise exception 'expected dead, got %', v_status; end if;
end;
$$;
select is((select status || '/' || attempts::text from public.email_outbox where id = (select id from p6_dead)), 'dead/6', 'the sixth failed attempt dead-letters the email');
select ok((select dead_at is not null and last_error_code = 'provider_unavailable' from public.email_outbox where id = (select id from p6_dead)), 'dead rows keep their last error code');
select is((select count(*)::integer from public.email_outbox_attempts where outbox_id = (select id from p6_dead) and outcome = 'dead'), 1, 'the final attempt is recorded as dead');
set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
select is((select display_status from public.quote_email_activity where id = (select id from p6_dead)), 'failed', 'a dead row displays as failed');
reset role;

-- A permanent failure dead-letters immediately; a cancelled email stays unsent.
create temporary table p6_perm as
select id from public.email_outbox where audience = 'internal' and id <> (select id from p6_dead) order by id limit 1;
grant all on p6_perm to service_role;
update public.email_outbox set next_attempt_at = now() - interval '1 second' where id = (select id from p6_perm);
set local role service_role;
select is(jsonb_array_length(public.claim_email_outbox(1, 60)), 1, 'fixture: claim a second row');
select is(public.complete_email_outbox((select id from p6_perm), 1, 'dead', null, 'invalid_recipient')->>'status', 'dead', 'a permanent failure dead-letters at once');
select throws_ok($$select public.complete_email_outbox(gen_random_uuid(), 1, 'sent', null, 'Bad Code')$$, '22023', 'outbox_error_code_invalid', 'error codes are short lowercase codes');
select throws_ok($$select public.complete_email_outbox(gen_random_uuid(), 1, 'exploded', null, null)$$, '22023', 'outbox_outcome_invalid', 'outcomes are a closed list');
reset role;

-- Lease expiry: an abandoned attempt is closed and the row is claimed again.
create temporary table p6_lease as
select id from public.email_outbox where audience = 'internal' and id not in (select id from p6_dead union select id from p6_perm) order by id limit 1;
grant all on p6_lease to service_role;
update public.email_outbox set next_attempt_at = now() - interval '1 second' where id = (select id from p6_lease);
set local role service_role;
select is(jsonb_array_length(public.claim_email_outbox(1, 60)), 1, 'fixture: claim a third row');
reset role;
update public.email_outbox set locked_until = now() - interval '1 second' where id = (select id from p6_lease);
set local role service_role;
select is((public.claim_email_outbox(1, 60) -> 0 ->> 'attempt_no'), '2', 'an expired lease is reclaimed as the next attempt');
reset role;
select is((select error_code from public.email_outbox_attempts where outbox_id = (select id from p6_lease) and attempt_no = 1), 'lease_expired', 'the abandoned attempt is recorded as lease_expired');

-- Cancelled when the quotation changed before delivery.
create temporary table p6_cancel (id uuid);
grant all on p6_cancel to service_role, authenticated;
set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'late@example.test', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000300'
from p6_q where key = 'f';
reset role;
insert into p6_cancel select id from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000300';
select public.p6_claims('11111111-1111-4111-8111-111111111111');
select public.begin_quote_revision((select quote_id from p6_q where key = 'f'), (select revision_id from p6_q where key = 'f'),
  (select version from public.quotes where id = (select quote_id from p6_q where key = 'f')), gen_random_uuid());
set local role service_role;
select is(jsonb_array_length(public.claim_email_outbox(1, 60)), 1, 'fixture: claim the email whose quotation changed');
select is(public.outbox_mint_share_link((select id from p6_cancel), 1)->>'status', 'cancelled', 'no link is minted for a revision that is no longer current');
select is(public.complete_email_outbox((select id from p6_cancel), 1, 'cancelled', null, 'link_unavailable')->>'status', 'cancelled', 'the email is cancelled');
reset role;
set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
select is((select display_status from public.quote_email_activity where id = (select id from p6_cancel)), 'cancelled', 'a cancelled row displays as cancelled');
reset role;

-- A dead-lettered buyer email leaves no live link behind.
set local role authenticated;
select public.p6_claims('11111111-1111-4111-8111-111111111111');
insert into public.quote_buyer_email_requests (quote_id, revision_id, expected_version, recipient_email, expires_at, command_id)
select quote_id, revision_id, (select version from public.quotes where id = quote_id), 'dead-buyer@example.test', now() + interval '5 days', 'c6000000-0000-4000-8000-000000000400'
from p6_q where key = 'a';
reset role;
create temporary table p6_deadbuyer as select id from public.email_outbox where dedupe_key = 'buyer-send:c6000000-0000-4000-8000-000000000400';
grant all on p6_deadbuyer to service_role;
create temporary table p6_deadmint (result jsonb);
grant all on p6_deadmint to service_role;
set local role service_role;
select is(jsonb_array_length(public.claim_email_outbox(1, 60)), 1, 'fixture: claim the buyer email that will die');
insert into p6_deadmint select public.outbox_mint_share_link((select id from p6_deadbuyer), 1);
select is((select result ->> 'status' from p6_deadmint), 'minted', 'its link is minted');
select is(public.complete_email_outbox((select id from p6_deadbuyer), 1, 'dead', null, 'provider_rejected')->>'status', 'dead', 'a permanent failure dead-letters the buyer email');
reset role;
select is((select disabled_reason::text from public.quote_share_links where selector = (select (result ->> 'selector')::uuid from p6_deadmint)), 'revoked', 'the link of a dead-lettered email is revoked');

select throws_ok($$delete from public.email_outbox_attempts$$, '55000', 'email_outbox_attempt_immutable', 'attempt rows are never deleted');
select throws_ok($$truncate public.email_outbox_attempts$$, '55000', 'email_outbox_attempt_immutable', 'the attempts log is never truncated');
select throws_ok($$update public.email_outbox_attempts set error_code = 'tampered' where finished_at is not null$$, '55000', 'email_outbox_attempt_immutable', 'a finished attempt cannot be rewritten');

select * from finish();
rollback;
