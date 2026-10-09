begin;

-- P5: one immutable PDF per issued quotation revision.
--
-- * A private storage bucket holds the bytes. Browser roles can read an object only when it is
--   registered and they hold quote.read for its organization; they can never write one.
-- * public.quote_revision_pdfs registers each stored file (sha256, size, the revision's own
--   snapshot_hash). A row is immutable and exists at most once per revision.
-- * Only the trusted Next server process (service_role) can register a file or claim a render.
--   None of the new routines is executable by authenticated or anon, so the definer allowlists
--   pinned by tests 15 and 18 are unchanged.

do $$
begin
  if to_regclass('public.quote_revisions') is null
    or to_regprocedure('public.has_org_capability(uuid,text)') is null then
    raise exception using errcode = '55000', message = 'p5_issued_pdfs_predecessor_missing';
  end if;
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise exception using errcode = '55000', message = 'p5_issued_pdfs_storage_missing';
  end if;
end;
$$;

-- ------------------------------------------------------------------ bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-pdfs', 'quote-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------- register table
-- Lets the register bind organization, quote, revision and the sealed snapshot hash with one
-- foreign key, so a row can never describe a different snapshot than the revision it names.
create unique index quote_revisions_pdf_anchor_key
  on public.quote_revisions (organization_id, quote_id, id, snapshot_hash);

create table public.quote_revision_pdfs (
  revision_id uuid primary key,
  organization_id uuid not null,
  quote_id uuid not null,
  storage_path text not null unique,
  sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_length integer not null check (byte_length between 1 and 10485760),
  snapshot_hash char(64) not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  generated_at timestamptz not null default now(),
  check (storage_path = 'org/' || organization_id::text || '/revision/' || revision_id::text || '.pdf'),
  foreign key (organization_id, quote_id, revision_id, snapshot_hash)
    references public.quote_revisions (organization_id, quote_id, id, snapshot_hash)
);
create index quote_revision_pdfs_quote_idx on public.quote_revision_pdfs (organization_id, quote_id);

create function public.prevent_quote_revision_pdf_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'quote_pdf_immutable';
end;
$$;

create trigger quote_revision_pdfs_immutable
before update or delete on public.quote_revision_pdfs
for each row execute function public.prevent_quote_revision_pdf_change();
create trigger quote_revision_pdfs_no_truncate
before truncate on public.quote_revision_pdfs
for each statement execute function public.prevent_quote_revision_pdf_change();

alter table public.quote_revision_pdfs enable row level security;
create policy quote_revision_pdfs_select_member on public.quote_revision_pdfs for select to authenticated
using (public.has_org_capability(organization_id, 'quote.read'));

revoke all on public.quote_revision_pdfs from public, anon, authenticated, service_role;
grant select on public.quote_revision_pdfs to authenticated;

-- ------------------------------------------------------- render attempt log
-- Database-backed throttle and single-flight lease. One row per render actually started.
create table public.quote_pdf_render_attempts (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.quote_revisions(id) on delete cascade,
  user_id uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  outcome text not null default 'started' check (outcome in ('started', 'succeeded', 'failed', 'expired')),
  check ((outcome = 'started') = (finished_at is null))
);
create index quote_pdf_render_attempts_user_idx on public.quote_pdf_render_attempts (user_id, started_at desc);
create index quote_pdf_render_attempts_revision_idx on public.quote_pdf_render_attempts (revision_id, started_at desc);

alter table public.quote_pdf_render_attempts enable row level security;
revoke all on public.quote_pdf_render_attempts from public, anon, authenticated, service_role;

-- ------------------------------------------------------------ claim a render
-- Decides, atomically, what a caller may do for one revision:
--   exists        a PDF is already registered; serve it, never render again
--   in_progress   another render holds the lease (90 s); wait, do not render
--   cooldown      the last render reported a failure less than 30 s ago (an abandoned lease is
--                 marked expired, not failed, so a stalled render never delays the next one)
--   rate_limited  the user already started 5 renders in the last 60 s
--   render        the caller holds the lease and must finish_quote_pdf_render
-- Claims are serialised per user and then per revision (fixed order, so no deadlock).
create function public.claim_quote_pdf_render(p_user_id uuid, p_revision_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_lease constant interval := interval '90 seconds';
  c_cooldown constant interval := interval '30 seconds';
  c_window constant interval := interval '60 seconds';
  c_limit constant integer := 5;
  v_revision public.quote_revisions%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_attempt uuid;
  v_count integer;
  v_oldest timestamptz;
  v_failed_at timestamptz;
begin
  if p_user_id is null or p_revision_id is null then
    raise exception using errcode = '22023', message = 'quote_pdf_claim_invalid';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quote_pdf_user:' || p_user_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('quote_pdf_revision:' || p_revision_id::text, 0));

  select * into v_revision from public.quote_revisions where id = p_revision_id;
  if not found or v_revision.state <> 'issued' or v_revision.snapshot is null or v_revision.snapshot_hash is null then
    return pg_catalog.jsonb_build_object('status', 'revision_not_renderable');
  end if;
  if exists (select 1 from public.quote_revision_pdfs where revision_id = p_revision_id) then
    return pg_catalog.jsonb_build_object('status', 'exists');
  end if;

  update public.quote_pdf_render_attempts
  set outcome = 'expired', finished_at = started_at + c_lease
  where revision_id = p_revision_id and outcome = 'started' and started_at <= v_now - c_lease;
  if exists (
    select 1 from public.quote_pdf_render_attempts
    where revision_id = p_revision_id and outcome = 'started'
  ) then
    return pg_catalog.jsonb_build_object('status', 'in_progress');
  end if;

  select pg_catalog.max(finished_at) into v_failed_at
  from public.quote_pdf_render_attempts
  where revision_id = p_revision_id and outcome = 'failed' and finished_at > v_now - c_cooldown;
  if v_failed_at is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'cooldown',
      'retry_after_seconds',
      greatest(1, pg_catalog.ceil(extract(epoch from (v_failed_at + c_cooldown - v_now)))::integer)
    );
  end if;

  select pg_catalog.count(*), pg_catalog.min(started_at) into v_count, v_oldest
  from public.quote_pdf_render_attempts
  where user_id = p_user_id and started_at > v_now - c_window;
  if v_count >= c_limit then
    return pg_catalog.jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_seconds',
      greatest(1, pg_catalog.ceil(extract(epoch from (v_oldest + c_window - v_now)))::integer)
    );
  end if;

  delete from public.quote_pdf_render_attempts where started_at < v_now - interval '1 day';
  insert into public.quote_pdf_render_attempts (revision_id, user_id, started_at)
  values (p_revision_id, p_user_id, v_now)
  returning id into v_attempt;
  return pg_catalog.jsonb_build_object('status', 'render', 'attempt_id', v_attempt);
end;
$$;

create function public.finish_quote_pdf_render(p_attempt_id uuid, p_succeeded boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.quote_pdf_render_attempts
  set outcome = case when p_succeeded then 'succeeded' else 'failed' end,
      finished_at = pg_catalog.clock_timestamp()
  where id = p_attempt_id and outcome = 'started';
$$;

-- ------------------------------------------------------- register a stored PDF
-- The caller supplies only the revision, the hash it computed from the bytes it holds, the
-- length and the path. Organization, quote and snapshot hash come from the revision itself.
-- The stored object must exist at the deterministic path with exactly that size. Storage keeps
-- no sha256, so the hash is trusted from the server process and is recorded exactly once.
create function public.record_quote_pdf(
  p_revision_id uuid,
  p_sha256 text,
  p_byte_length integer,
  p_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_revision public.quote_revisions%rowtype;
  v_expected text;
  v_size bigint;
  v_row public.quote_revision_pdfs%rowtype;
  v_created boolean := false;
begin
  select * into v_revision from public.quote_revisions where id = p_revision_id;
  if not found or v_revision.state <> 'issued' or v_revision.snapshot is null or v_revision.snapshot_hash is null then
    raise exception using errcode = '55000', message = 'quote_pdf_revision_not_issued';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'quote_pdf_sha256_invalid';
  end if;
  if p_byte_length is null or p_byte_length not between 1 and 10485760 then
    raise exception using errcode = '22023', message = 'quote_pdf_size_invalid';
  end if;
  v_expected := 'org/' || v_revision.organization_id::text || '/revision/' || v_revision.id::text || '.pdf';
  if p_path is distinct from v_expected then
    raise exception using errcode = '22023', message = 'quote_pdf_path_invalid';
  end if;
  select (stored.metadata ->> 'size')::bigint into v_size
  from storage.objects stored
  where stored.bucket_id = 'quote-pdfs' and stored.name = p_path;
  if not found then
    raise exception using errcode = '55000', message = 'quote_pdf_object_missing';
  end if;
  if v_size is distinct from p_byte_length::bigint then
    raise exception using errcode = '22023', message = 'quote_pdf_size_mismatch';
  end if;

  insert into public.quote_revision_pdfs (
    revision_id, organization_id, quote_id, storage_path, sha256, byte_length, snapshot_hash
  ) values (
    v_revision.id, v_revision.organization_id, v_revision.quote_id, p_path,
    p_sha256, p_byte_length, v_revision.snapshot_hash
  )
  on conflict (revision_id) do nothing
  returning * into v_row;
  if found then
    v_created := true;
  else
    select * into v_row from public.quote_revision_pdfs where revision_id = p_revision_id;
  end if;
  return pg_catalog.jsonb_build_object(
    'revision_id', v_row.revision_id,
    'organization_id', v_row.organization_id,
    'quote_id', v_row.quote_id,
    'storage_path', v_row.storage_path,
    'sha256', v_row.sha256,
    'byte_length', v_row.byte_length,
    'snapshot_hash', v_row.snapshot_hash,
    'generated_at', v_row.generated_at,
    'created', v_created
  );
end;
$$;

revoke all on function public.prevent_quote_revision_pdf_change(),
  public.claim_quote_pdf_render(uuid, uuid),
  public.finish_quote_pdf_render(uuid, boolean),
  public.record_quote_pdf(uuid, text, integer, text)
from public, anon, authenticated, service_role;
grant execute on function public.claim_quote_pdf_render(uuid, uuid),
  public.finish_quote_pdf_render(uuid, boolean),
  public.record_quote_pdf(uuid, text, integer, text)
to service_role;

-- ------------------------------------------------------------ storage access
-- Read only, and only for objects that are registered for an organization the caller can read.
-- There is deliberately no insert, update or delete policy for any browser role.
create policy quote_pdfs_read_registered on storage.objects for select to authenticated
using (
  bucket_id = 'quote-pdfs'
  and exists (
    select 1 from public.quote_revision_pdfs pdf
    where pdf.storage_path = name
  )
);

comment on table public.quote_revision_pdfs is
  'One immutable, hash-registered PDF per issued quotation revision. Written only by the trusted server through record_quote_pdf; kept indefinitely; no delete path for any role.';
comment on table public.quote_pdf_render_attempts is
  'Operational throttle and single-flight lease for PDF rendering. Not part of the commercial record.';
comment on function public.record_quote_pdf(uuid, text, integer, text) is
  'service_role only. Registers the stored PDF for an issued revision; organization, quote and snapshot hash are derived from the revision.';

commit;
