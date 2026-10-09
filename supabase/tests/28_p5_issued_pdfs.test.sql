begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(79);

-- ---------------------------------------------------------------- fixtures
create function public.p5_claims(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true)
$$;

-- An organization-A quote for product PCA-220 x 1: draft, submitted, or issued.
create function public.p5_make(p_key text, p_stage text) returns void language plpgsql as $$
declare
  v_created jsonb; v_quote uuid; v_revision uuid;
begin
  perform public.p5_claims('11111111-1111-4111-8111-111111111111');
  v_created := public.create_verified_quote_draft(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a3000000-0000-4000-8000-000000000001',
    'INR', 'en-IN', 'GST 18%', 'exclusive'::public.tax_price_basis,
    current_date, (current_date + 31), gen_random_uuid());
  v_quote := (v_created ->> 'id')::uuid;
  v_revision := (v_created ->> 'current_revision_id')::uuid;
  perform public.save_quote_draft(v_quote, 1, gen_random_uuid(), jsonb_build_object(
    'customer_id', 'a3000000-0000-4000-8000-000000000001', 'currency_code', 'INR',
    'locale', 'en-IN', 'tax_label', 'GST 18%', 'tax_mode', 'exclusive',
    'discount_bps', 0, 'issue_date', current_date, 'valid_until', (current_date + 31),
    'notes', 'p5 fixture', 'items', jsonb_build_array(jsonb_build_object('line_id', null,
      'product_id', 'a2000000-0000-4000-8000-000000000001', 'position', 1, 'quantity_scaled', 1, 'quantity_scale', 1)),
    'charges', '[]'::jsonb));
  if p_stage in ('submitted', 'issued') then
    perform public.submit_quote_revision(v_quote, v_revision,
      (select version from public.quotes where id = v_quote), gen_random_uuid());
  end if;
  if p_stage = 'issued' then
    perform public.issue_quote_revision(v_quote, v_revision,
      (select version from public.quotes where id = v_quote), gen_random_uuid());
  end if;
  insert into p5_q values (p_key, v_quote, v_revision);
end;
$$;

create function public.p5_begin(p_quote uuid) returns void language plpgsql as $$
begin
  perform public.p5_claims('11111111-1111-4111-8111-111111111111');
  perform public.begin_quote_revision(p_quote, (select current_revision_id from public.quotes where id = p_quote),
    (select version from public.quotes where id = p_quote), gen_random_uuid());
end;
$$;

create function public.p5_path(p_revision uuid) returns text language sql stable security definer set search_path = public as $$
  select 'org/' || organization_id::text || '/revision/' || id::text || '.pdf'
  from public.quote_revisions where id = p_revision
$$;

create function public.p5_exec_count(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin execute p_sql; get diagnostics n = row_count; return n; end;
$$;
grant execute on function public.p5_exec_count(text) to authenticated, anon;

create temporary table p5_q (key text primary key, quote_id uuid not null, revision_id uuid not null);
grant all on p5_q to authenticated, anon, service_role;
create temporary table p5_claim (key text primary key, result jsonb);
grant all on p5_claim to service_role;
create temporary table p5_rec (key text primary key, result jsonb);
grant all on p5_rec to service_role;
select public.p5_make('issued', 'issued');
select public.p5_make('draft', 'draft');
select public.p5_make('second', 'issued');

-- ------------------------------------------------------------------ bucket
select is((select public from storage.buckets where id = 'quote-pdfs'), false, 'the quote-pdfs bucket exists and is private');
select is((select allowed_mime_types from storage.buckets where id = 'quote-pdfs'), array['application/pdf'], 'the bucket accepts application/pdf only');
select is((select file_size_limit from storage.buckets where id = 'quote-pdfs'), 10485760::bigint, 'the bucket limit is 10 MiB');

-- -------------------------------------------------------------- privileges
select ok(not has_function_privilege('authenticated', 'public.claim_quote_pdf_render(uuid,uuid)', 'execute')
  and not has_function_privilege('anon', 'public.claim_quote_pdf_render(uuid,uuid)', 'execute')
  and not has_function_privilege('public', 'public.claim_quote_pdf_render(uuid,uuid)', 'execute'), 'browser roles and PUBLIC cannot claim a render');
select ok(not has_function_privilege('authenticated', 'public.finish_quote_pdf_render(uuid,boolean)', 'execute')
  and not has_function_privilege('anon', 'public.finish_quote_pdf_render(uuid,boolean)', 'execute')
  and not has_function_privilege('public', 'public.finish_quote_pdf_render(uuid,boolean)', 'execute'), 'browser roles and PUBLIC cannot finish a render');
select ok(not has_function_privilege('authenticated', 'public.record_quote_pdf(uuid,text,integer,text)', 'execute')
  and not has_function_privilege('anon', 'public.record_quote_pdf(uuid,text,integer,text)', 'execute')
  and not has_function_privilege('public', 'public.record_quote_pdf(uuid,text,integer,text)', 'execute'), 'browser roles and PUBLIC cannot register a PDF');
select ok(has_function_privilege('service_role', 'public.claim_quote_pdf_render(uuid,uuid)', 'execute')
  and has_function_privilege('service_role', 'public.finish_quote_pdf_render(uuid,boolean)', 'execute')
  and has_function_privilege('service_role', 'public.record_quote_pdf(uuid,text,integer,text)', 'execute'), 'service_role executes the three P5 routines');
select ok(not has_function_privilege('authenticated', 'public.prevent_quote_revision_pdf_change()', 'execute')
  and not has_function_privilege('anon', 'public.prevent_quote_revision_pdf_change()', 'execute')
  and not has_function_privilege('service_role', 'public.prevent_quote_revision_pdf_change()', 'execute'), 'the immutability trigger function is executable by no application role');
select ok(has_table_privilege('authenticated', 'public.quote_revision_pdfs', 'select') and not has_table_privilege('anon', 'public.quote_revision_pdfs', 'select'), 'authenticated reads the register; anon does not');
select ok(not has_table_privilege('authenticated', 'public.quote_revision_pdfs', 'insert')
  and not has_table_privilege('authenticated', 'public.quote_revision_pdfs', 'update')
  and not has_table_privilege('authenticated', 'public.quote_revision_pdfs', 'delete')
  and not has_table_privilege('authenticated', 'public.quote_revision_pdfs', 'truncate'), 'authenticated has no write privilege on the register');
select ok(not has_table_privilege('service_role', 'public.quote_revision_pdfs', 'insert')
  and not has_table_privilege('service_role', 'public.quote_revision_pdfs', 'update')
  and not has_table_privilege('service_role', 'public.quote_revision_pdfs', 'delete'), 'even service_role writes the register only through record_quote_pdf');
select ok(not has_table_privilege('authenticated', 'public.quote_pdf_render_attempts', 'select')
  and not has_table_privilege('anon', 'public.quote_pdf_render_attempts', 'select')
  and not has_table_privilege('service_role', 'public.quote_pdf_render_attempts', 'insert'), 'the attempt log is closed to browser roles and written only by the routines');
select ok((select relrowsecurity from pg_class where oid = 'public.quote_revision_pdfs'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.quote_pdf_render_attempts'::regclass), 'both new tables have RLS enabled');

-- ------------------------------------------------------------ claim: lease
select is((select (snapshot_hash is not null and state = 'issued')
  from public.quote_revisions where id = (select revision_id from p5_q where key = 'issued')), true, 'fixture revision is issued and sealed');

set local role service_role;
insert into p5_claim select 'first', public.claim_quote_pdf_render('11111111-1111-4111-8111-111111111111', (select revision_id from p5_q where key = 'issued'));
select is((select result ->> 'status' from p5_claim where key = 'first'), 'render', 'the first claim for a revision may render');
select ok((select (result ->> 'attempt_id') is not null from p5_claim where key = 'first'), 'a render claim carries an attempt id');
select is(public.claim_quote_pdf_render('11111111-1111-4111-8111-111111111111', (select revision_id from p5_q where key = 'issued')) ->> 'status', 'in_progress', 'a second claim by the same user waits instead of rendering');
select is(public.claim_quote_pdf_render('22222222-2222-4222-8222-222222222222', (select revision_id from p5_q where key = 'issued')) ->> 'status', 'in_progress', 'a claim by another user waits instead of rendering');
select is(public.claim_quote_pdf_render('11111111-1111-4111-8111-111111111111', (select revision_id from p5_q where key = 'draft')) ->> 'status', 'revision_not_renderable', 'a draft revision is not renderable');
select is(public.claim_quote_pdf_render('11111111-1111-4111-8111-111111111111', gen_random_uuid()) ->> 'status', 'revision_not_renderable', 'an unknown revision is not renderable');
select throws_ok($$select public.claim_quote_pdf_render(null, gen_random_uuid())$$, '22023', 'quote_pdf_claim_invalid', 'a claim without a user is rejected');

-- ------------------------------------------------------ claim: failure cooldown
select lives_ok($$select public.finish_quote_pdf_render((select (result ->> 'attempt_id')::uuid from p5_claim where key = 'first'), false)$$, 'the renderer reports a failure');
insert into p5_claim select 'cool', public.claim_quote_pdf_render('22222222-2222-4222-8222-222222222222', (select revision_id from p5_q where key = 'issued'));
select is((select result ->> 'status' from p5_claim where key = 'cool'), 'cooldown', 'a claim within 30 s of a failed render is refused');
select ok((select (result ->> 'retry_after_seconds')::integer between 1 and 30 from p5_claim where key = 'cool'), 'the cooldown reports a retry time of 1 to 30 seconds');

reset role;
select is((select outcome from public.quote_pdf_render_attempts where id = (select (result ->> 'attempt_id')::uuid from p5_claim where key = 'first')), 'failed', 'the attempt is recorded as failed');
update public.quote_pdf_render_attempts set started_at = started_at - interval '31 seconds', finished_at = finished_at - interval '31 seconds';
set local role service_role;
insert into p5_claim select 'after_cooldown', public.claim_quote_pdf_render('22222222-2222-4222-8222-222222222222', (select revision_id from p5_q where key = 'issued'));
select is((select result ->> 'status' from p5_claim where key = 'after_cooldown'), 'render', 'a claim after the cooldown may render again');

-- ----------------------------------------------------------- claim: expiry
reset role;
update public.quote_pdf_render_attempts set started_at = started_at - interval '100 seconds'
  where outcome = 'started';
set local role service_role;
insert into p5_claim select 'after_lease', public.claim_quote_pdf_render('22222222-2222-4222-8222-222222222222', (select revision_id from p5_q where key = 'issued'));
select is((select result ->> 'status' from p5_claim where key = 'after_lease'), 'render', 'an abandoned lease older than 90 s no longer blocks a new render');
reset role;
select is((select count(*)::integer from public.quote_pdf_render_attempts where outcome = 'expired'), 1, 'the abandoned lease is marked expired, not failed');
set local role service_role;

-- ------------------------------------------------------ claim: rate limit
select lives_ok($$select public.finish_quote_pdf_render((select (result ->> 'attempt_id')::uuid from p5_claim where key = 'after_lease'), true)$$, 'the render completes');
reset role;
delete from public.quote_pdf_render_attempts;
insert into public.quote_pdf_render_attempts (revision_id, user_id, started_at, finished_at, outcome)
select (select revision_id from p5_q where key = 'issued'), '33333333-3333-4333-8333-333333333333',
  pg_catalog.clock_timestamp() - make_interval(secs => 10 * n), pg_catalog.clock_timestamp() - make_interval(secs => 10 * n - 1), 'succeeded'
from generate_series(1, 4) n;
set local role service_role;
insert into p5_claim select 'four', public.claim_quote_pdf_render('33333333-3333-4333-8333-333333333333', (select revision_id from p5_q where key = 'issued'));
select is((select result ->> 'status' from p5_claim where key = 'four'), 'render', 'the fifth render in a minute is allowed');
select lives_ok($$select public.finish_quote_pdf_render((select (result ->> 'attempt_id')::uuid from p5_claim where key = 'four'), true)$$, 'the fifth render completes');
insert into p5_claim select 'five', public.claim_quote_pdf_render('33333333-3333-4333-8333-333333333333', (select revision_id from p5_q where key = 'issued'));
select is((select result ->> 'status' from p5_claim where key = 'five'), 'rate_limited', 'the sixth render in a minute is refused');
select ok((select (result ->> 'retry_after_seconds')::integer between 1 and 60 from p5_claim where key = 'five'), 'the rate limit reports a retry time of 1 to 60 seconds');
select is(public.claim_quote_pdf_render('11111111-1111-4111-8111-111111111111', (select revision_id from p5_q where key = 'issued')) ->> 'status', 'render', 'the limit is per user: another user still renders');
reset role;
update public.quote_pdf_render_attempts set started_at = started_at - interval '61 seconds', finished_at = finished_at - interval '61 seconds'
  where user_id = '33333333-3333-4333-8333-333333333333';
update public.quote_pdf_render_attempts set outcome = 'succeeded', finished_at = pg_catalog.clock_timestamp()
  where outcome = 'started';
set local role service_role;
select is(public.claim_quote_pdf_render('33333333-3333-4333-8333-333333333333', (select revision_id from p5_q where key = 'issued')) ->> 'status', 'render', 'the window slides: after a minute the user renders again');
reset role;
delete from public.quote_pdf_render_attempts;

-- ------------------------------------------------------- record_quote_pdf
set local role service_role;
select throws_ok(format($$select public.record_quote_pdf(%L, %L, 1234, %L)$$, (select revision_id from p5_q where key = 'issued'), repeat('a', 64), 'org/x/revision/y.pdf'),
  '22023', 'quote_pdf_path_invalid', 'a path other than the deterministic one is rejected');
select throws_ok(format($$select public.record_quote_pdf(%L, %L, 1234, public.p5_path(%L))$$, (select revision_id from p5_q where key = 'issued'), repeat('a', 64), (select revision_id from p5_q where key = 'issued')),
  '55000', 'quote_pdf_object_missing', 'a revision whose object was never stored is rejected');
select throws_ok(format($$select public.record_quote_pdf(%L, %L, 1234, public.p5_path(%L))$$, (select revision_id from p5_q where key = 'draft'), repeat('a', 64), (select revision_id from p5_q where key = 'draft')),
  '55000', 'quote_pdf_revision_not_issued', 'a draft revision cannot be registered');
select throws_ok(format($$select public.record_quote_pdf(%L, 'not-a-hash', 1234, public.p5_path(%L))$$, (select revision_id from p5_q where key = 'issued'), (select revision_id from p5_q where key = 'issued')),
  '22023', 'quote_pdf_sha256_invalid', 'a malformed hash is rejected');
select throws_ok(format($$select public.record_quote_pdf(%L, %L, 0, public.p5_path(%L))$$, (select revision_id from p5_q where key = 'issued'), repeat('a', 64), (select revision_id from p5_q where key = 'issued')),
  '22023', 'quote_pdf_size_invalid', 'a zero length is rejected');
select throws_ok(format($$select public.record_quote_pdf(%L, %L, 99999999, public.p5_path(%L))$$, (select revision_id from p5_q where key = 'issued'), repeat('a', 64), (select revision_id from p5_q where key = 'issued')),
  '22023', 'quote_pdf_size_invalid', 'a length above the 10 MiB limit is rejected');

reset role;
insert into storage.objects (bucket_id, name, metadata)
select 'quote-pdfs', public.p5_path(revision_id), jsonb_build_object('size', 1234, 'mimetype', 'application/pdf')
from p5_q where key = 'issued';
insert into storage.objects (bucket_id, name, metadata)
select 'quote-pdfs', public.p5_path(revision_id), jsonb_build_object('size', 777, 'mimetype', 'application/pdf')
from p5_q where key = 'second';
insert into storage.objects (bucket_id, name, metadata)
values ('quote-pdfs', 'org/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/revision/00000000-0000-4000-8000-0000000000aa.pdf', '{"size": 10}');
set local role service_role;

select throws_ok(format($$select public.record_quote_pdf(%L, %L, 1235, public.p5_path(%L))$$, (select revision_id from p5_q where key = 'issued'), repeat('a', 64), (select revision_id from p5_q where key = 'issued')),
  '22023', 'quote_pdf_size_mismatch', 'a length that differs from the stored object is rejected');

insert into p5_rec select 'first', public.record_quote_pdf((select revision_id from p5_q where key = 'issued'), repeat('a', 64), 1234, public.p5_path((select revision_id from p5_q where key = 'issued')));
select is((select result ->> 'created' from p5_rec where key = 'first'), 'true', 'the first registration creates the row');
select is((select result ->> 'sha256' from p5_rec where key = 'first'), repeat('a', 64), 'the recorded hash is the supplied one');
insert into p5_rec select 'again', public.record_quote_pdf((select revision_id from p5_q where key = 'issued'), repeat('b', 64), 1234, public.p5_path((select revision_id from p5_q where key = 'issued')));
select is((select result ->> 'created' from p5_rec where key = 'again'), 'false', 'a second registration creates nothing');
select is((select result ->> 'sha256' from p5_rec where key = 'again'), repeat('a', 64), 'a second registration returns the first row, not the new hash');
select is(public.claim_quote_pdf_render('11111111-1111-4111-8111-111111111111', (select revision_id from p5_q where key = 'issued')) ->> 'status', 'exists', 'once registered, a claim reports exists and never renders');

reset role;
select is((select count(*)::integer from public.quote_revision_pdfs where revision_id = (select revision_id from p5_q where key = 'issued')), 1, 'exactly one row exists for the revision');
select is((select snapshot_hash::text from public.quote_revision_pdfs where revision_id = (select revision_id from p5_q where key = 'issued')),
  (select snapshot_hash::text from public.quote_revisions where id = (select revision_id from p5_q where key = 'issued')), 'the row takes snapshot_hash from the revision, not from the caller');
select is((select organization_id from public.quote_revision_pdfs where revision_id = (select revision_id from p5_q where key = 'issued')),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'the row takes the organization from the revision');
select is((select quote_id from public.quote_revision_pdfs where revision_id = (select revision_id from p5_q where key = 'issued')),
  (select quote_id from p5_q where key = 'issued'), 'the row takes the quote from the revision');

-- ----------------------------------------------------------- immutability
select throws_ok($$update public.quote_revision_pdfs set sha256 = repeat('c', 64)$$, '55000', 'quote_pdf_immutable', 'the table owner cannot update a registered PDF');
select throws_ok($$delete from public.quote_revision_pdfs$$, '55000', 'quote_pdf_immutable', 'the table owner cannot delete a registered PDF');
select throws_ok($$truncate public.quote_revision_pdfs$$, '55000', 'quote_pdf_immutable', 'the table owner cannot truncate the register');
select throws_ok(format($$insert into public.quote_revision_pdfs (revision_id, organization_id, quote_id, storage_path, sha256, byte_length, snapshot_hash)
  select id, organization_id, quote_id, public.p5_path(id), repeat('d', 64), 777, repeat('0', 64) from public.quote_revisions where id = %L$$, (select revision_id from p5_q where key = 'second')),
  '23503', null, 'a row cannot name a snapshot hash other than the revision''s own');
select throws_ok(format($$insert into public.quote_revision_pdfs (revision_id, organization_id, quote_id, storage_path, sha256, byte_length, snapshot_hash)
  select id, organization_id, quote_id, 'org/elsewhere.pdf', repeat('d', 64), 777, snapshot_hash from public.quote_revisions where id = %L$$, (select revision_id from p5_q where key = 'second')),
  '23514', null, 'a row cannot carry a non-deterministic path');

-- ----------------------------------------------------- browser read access
set local role authenticated;
select public.p5_claims('11111111-1111-4111-8111-111111111111');
select is((select count(*)::integer from public.quote_revision_pdfs), 1, 'operator reads the organization''s register row');
select is((select count(*)::integer from storage.objects where bucket_id = 'quote-pdfs'), 1, 'operator sees the registered object and none of the unregistered ones in the bucket');
select throws_ok($$update public.quote_revision_pdfs set sha256 = repeat('e', 64)$$, '42501', null, 'operator cannot update the register');
select throws_ok($$delete from public.quote_revision_pdfs$$, '42501', null, 'operator cannot delete from the register');
select throws_ok($$insert into public.quote_revision_pdfs (revision_id, organization_id, quote_id, storage_path, sha256, byte_length, snapshot_hash) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'x', repeat('e', 64), 1, repeat('e', 64))$$, '42501', null, 'operator cannot insert into the register');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata) values ('quote-pdfs', 'org/forged.pdf', '{"size": 1}')$$, '42501', null, 'operator cannot upload into the bucket');
select is(public.p5_exec_count($$update storage.objects set name = name || 'x' where bucket_id = 'quote-pdfs'$$), 0, 'operator cannot modify a stored PDF');
select throws_ok($$delete from storage.objects where bucket_id = 'quote-pdfs'$$, '42501', null, 'operator cannot delete a stored PDF');
select throws_ok($$select * from public.quote_pdf_render_attempts$$, '42501', null, 'operator cannot read the attempt log');

select public.p5_claims('22222222-2222-4222-8222-222222222222');
select is((select count(*)::integer from public.quote_revision_pdfs), 1, 'manager reads the register row');
select is((select count(*)::integer from storage.objects where bucket_id = 'quote-pdfs'), 1, 'manager sees the registered object');

select public.p5_claims('55555555-5555-4555-8555-555555555555');
select is((select count(*)::integer from public.quote_revision_pdfs), 1, 'reviewer (quote.read) reads the register row');
select is((select count(*)::integer from storage.objects where bucket_id = 'quote-pdfs' and name = public.p5_path((select revision_id from p5_q where key = 'issued'))), 1, 'reviewer can read the registered object');
select throws_ok($$delete from storage.objects where bucket_id = 'quote-pdfs'$$, '42501', null, 'reviewer cannot delete a stored PDF');

select public.p5_claims('44444444-4444-4444-8444-444444444444');
select is((select count(*)::integer from public.quote_revision_pdfs), 0, 'another organization sees no register row');
select is((select count(*)::integer from storage.objects where bucket_id = 'quote-pdfs'), 0, 'another organization sees no stored object');

reset role;
set local role anon;
select throws_ok($$select * from public.quote_revision_pdfs$$, '42501', null, 'anon cannot read the register');
select is((select count(*)::integer from storage.objects where bucket_id = 'quote-pdfs'), 0, 'anon sees no stored object');
reset role;

-- A bucket the policy does not cover is unaffected by its checks.
insert into storage.buckets (id, name, public) values ('p5-other', 'p5-other', false);
insert into storage.objects (bucket_id, name, metadata) values ('p5-other', 'not-a-uuid/anything.txt', '{"size": 3}');
set local role authenticated;
select public.p5_claims('11111111-1111-4111-8111-111111111111');
select lives_ok($$select count(*) from storage.objects where bucket_id = 'p5-other'$$, 'objects of unrelated buckets are evaluated without error');
select is((select count(*)::integer from storage.objects where bucket_id = 'p5-other'), 0, 'and remain invisible to browser roles');
reset role;

-- --------------------------------------------- successor revisions leave PDFs alone
select lives_ok(format($$select public.p5_begin(%L)$$, (select quote_id from p5_q where key = 'issued')), 'a successor revision begins');
select is((select state::text from public.quote_revisions where id = (select revision_id from p5_q where key = 'issued')), 'issued', 'the first revision is still issued');
select is((select count(*)::integer from public.quote_revision_pdfs where revision_id = (select revision_id from p5_q where key = 'issued')), 1, 'its registered PDF is untouched by the successor');

select * from finish();
rollback;
