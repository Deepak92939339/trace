begin;

-- P6: transactional email outbox.
--
-- * An email is a row in public.email_outbox, written in the SAME transaction as the business
--   event that causes it (row triggers on quote_recipient_events and quote_revisions; an
--   INSTEAD OF view for the issuer's explicit "Email to buyer"). Nothing is ever sent inline.
-- * A separate worker drains the table through three service_role-only routines. It never
--   persists a share-link secret: for buyer mail the link is minted at delivery time.
-- * No new routine is executable by authenticated or anon (tests 15 and 18 stay unchanged):
--   browser writes go through a view, browser reads through a view, everything else is a trigger
--   function or a service_role routine. Browser roles have no privilege on the tables.
-- * Internal notification addresses are never readable by browser roles: the activity view
--   returns the address only for buyer mail and a fixed label for internal mail.
-- * A failing enqueue never blocks the business event (it is isolated in a sub-transaction and
--   logged as a warning); the commercial record is the authority, the email is a notification.

do $$
begin
  if to_regclass('public.quote_share_links') is null
    or to_regclass('public.quote_recipient_events') is null
    or to_regclass('public.role_capabilities') is null
    or to_regprocedure('public.has_org_capability(uuid,text)') is null
    or to_regprocedure('public.organization_local_date(uuid,timestamptz)') is null then
    raise exception using errcode = '55000', message = 'p6_email_outbox_predecessor_missing';
  end if;
end;
$$;

-- ------------------------------------------------------------------ tables
-- Deliberately no foreign keys to quotes/revisions/users: the outbox is a retained record that
-- must not block, or be cascaded by, administrative cleanup of those tables. The enqueue paths
-- below only ever insert identifiers they have just read.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  quote_id uuid not null,
  revision_id uuid not null,
  kind text not null check (kind in (
    'quote_to_buyer', 'buyer_accepted', 'buyer_declined', 'buyer_change_requested', 'approval_waiting'
  )),
  audience text generated always as (
    case when kind = 'quote_to_buyer' then 'buyer' else 'internal' end
  ) stored,
  recipient_email text not null check (
    char_length(recipient_email) between 3 and 254
    and recipient_email = lower(btrim(recipient_email))
    and recipient_email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+$'
  ),
  recipient_user_id uuid,
  dedupe_key text not null unique check (char_length(dedupe_key) between 8 and 250),
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and pg_catalog.octet_length(payload::text) <= 4096
    and not (payload ?| array['secret', 'token', 'selector', 'cost', 'margin', 'unit_cost'])
  ),
  share_expires_at timestamptz,
  share_link_id uuid,
  created_by uuid,
  status text not null default 'queued' check (status in (
    'queued', 'sending', 'sent', 'retry_wait', 'dead', 'cancelled'
  )),
  attempts integer not null default 0 check (attempts between 0 and 20),
  max_attempts integer not null default 6 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z_]{3,40}$'),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  dead_at timestamptz,
  check ((status = 'sent') = (sent_at is not null)),
  check ((status = 'dead') = (dead_at is not null)),
  check (kind <> 'quote_to_buyer' or share_expires_at is not null),
  check (kind <> 'quote_to_buyer' or created_by is not null)
);
create index email_outbox_due_idx on public.email_outbox (next_attempt_at)
  where status in ('queued', 'retry_wait');
create index email_outbox_lease_idx on public.email_outbox (locked_until) where status = 'sending';
create index email_outbox_quote_idx on public.email_outbox (organization_id, quote_id, created_at desc);

create table public.email_outbox_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.email_outbox (id),
  attempt_no integer not null check (attempt_no > 0),
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  outcome text check (outcome in ('sent', 'retry', 'dead', 'cancelled')),
  error_code text check (error_code is null or error_code ~ '^[a-z_]{3,40}$'),
  unique (outbox_id, attempt_no),
  check ((outcome is null) = (finished_at is null))
);

-- ------------------------------------------------------------------ guards
create function public.guard_email_outbox()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception using errcode = '55000', message = 'email_outbox_immutable';
  end if;
  if old.status in ('sent', 'dead', 'cancelled') then
    raise exception using errcode = '55000', message = 'email_outbox_terminal';
  end if;
  if row(new.id, new.organization_id, new.quote_id, new.revision_id, new.kind, new.recipient_email,
         new.recipient_user_id, new.dedupe_key, new.payload, new.share_expires_at, new.created_by,
         new.created_at, new.max_attempts)
     is distinct from
     row(old.id, old.organization_id, old.quote_id, old.revision_id, old.kind, old.recipient_email,
         old.recipient_user_id, old.dedupe_key, old.payload, old.share_expires_at, old.created_by,
         old.created_at, old.max_attempts) then
    raise exception using errcode = '55000', message = 'email_outbox_content_immutable';
  end if;
  return new;
end;
$$;
create trigger email_outbox_guard before update or delete on public.email_outbox
for each row execute function public.guard_email_outbox();
create trigger email_outbox_no_truncate before truncate on public.email_outbox
for each statement execute function public.guard_email_outbox();

create function public.guard_email_outbox_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    raise exception using errcode = '55000', message = 'email_outbox_attempt_immutable';
  end if;
  if old.finished_at is not null
    or row(new.id, new.outbox_id, new.attempt_no, new.started_at)
       is distinct from row(old.id, old.outbox_id, old.attempt_no, old.started_at) then
    raise exception using errcode = '55000', message = 'email_outbox_attempt_immutable';
  end if;
  return new;
end;
$$;
create trigger email_outbox_attempt_guard before update or delete on public.email_outbox_attempts
for each row execute function public.guard_email_outbox_attempt();
create trigger email_outbox_attempt_no_truncate before truncate on public.email_outbox_attempts
for each statement execute function public.guard_email_outbox_attempt();

alter table public.email_outbox enable row level security;
alter table public.email_outbox_attempts enable row level security;
revoke all on public.email_outbox, public.email_outbox_attempts
  from public, anon, authenticated, service_role;

-- --------------------------------------------------------------- insert helper
create function public.outbox_insert(
  p_organization_id uuid,
  p_quote_id uuid,
  p_revision_id uuid,
  p_kind text,
  p_email text,
  p_user_id uuid,
  p_dedupe_key text,
  p_payload jsonb,
  p_share_expires_at timestamptz,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.email_outbox (
    organization_id, quote_id, revision_id, kind, recipient_email, recipient_user_id,
    dedupe_key, payload, share_expires_at, created_by
  ) values (
    p_organization_id, p_quote_id, p_revision_id, p_kind, lower(btrim(p_email)), p_user_id,
    p_dedupe_key, p_payload, p_share_expires_at, p_created_by
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- --------------------------------------- (b) buyer response -> issuing organization
create function public.enqueue_buyer_response_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_revision public.quote_revisions%rowtype;
  v_link public.quote_share_links%rowtype;
  v_kind text;
  v_message text;
  v_recipient record;
begin
  begin
    select * into v_quote from public.quotes where id = new.quote_id;
    select * into v_revision from public.quote_revisions where id = new.revision_id;
    select * into v_link from public.quote_share_links where id = new.share_link_id;
    if v_quote.id is null or v_revision.id is null or v_link.id is null then
      return new;
    end if;
    v_kind := case new.event_type::text
      when 'accepted' then 'buyer_accepted'
      when 'declined' then 'buyer_declined'
      else 'buyer_change_requested' end;
    v_message := nullif(btrim(pg_catalog.left(
      pg_catalog.regexp_replace(coalesce(new.message, ''), '[[:cntrl:]]+', ' ', 'g'), 500)), '');
    -- Revision issuer and share-link creator, de-duplicated, active members only.
    for v_recipient in
      select distinct member.user_id, pg_catalog.lower(pg_catalog.btrim(account.email)) as email
      from (values (v_revision.issued_by), (v_link.created_by)) as candidate(user_id)
      join public.organization_memberships member
        on member.user_id = candidate.user_id
       and member.organization_id = new.organization_id
       and member.status = 'active'
      join auth.users account on account.id = member.user_id
      where candidate.user_id is not null and coalesce(account.email, '') <> ''
    loop
      perform public.outbox_insert(
        new.organization_id, new.quote_id, new.revision_id, v_kind, v_recipient.email,
        v_recipient.user_id,
        'buyer-response:' || new.id::text || ':' || v_recipient.user_id::text,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'quote_number', v_quote.number,
          'customer_name', coalesce(v_revision.snapshot #>> '{buyer,name}', v_quote.customer_name_snapshot),
          'revision_number', v_revision.revision_number,
          'buyer_message', case when new.event_type::text = 'accepted' then null else v_message end)),
        null, null);
    end loop;
  exception when others then
    raise warning 'email_outbox_enqueue_failed buyer_response %', sqlstate;
  end;
  return new;
end;
$$;
create trigger quote_recipient_events_enqueue_email
after insert on public.quote_recipient_events
for each row
when (new.event_type::text in ('accepted', 'declined', 'change_requested'))
execute function public.enqueue_buyer_response_email();

-- -------------------------------------------- (c) waiting for approval -> managers
create function public.enqueue_approval_waiting_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recipient record;
begin
  begin
    for v_recipient in
      select member.user_id, pg_catalog.lower(pg_catalog.btrim(account.email)) as email
      from public.organization_memberships member
      join auth.users account on account.id = member.user_id
      where member.organization_id = new.organization_id
        and member.status = 'active'
        and member.user_id is distinct from new.submitted_by
        and coalesce(account.email, '') <> ''
        and exists (
          select 1 from public.role_capabilities mapping
          where mapping.role_id = member.role_id and mapping.capability_key = 'quote.approve')
    loop
      perform public.outbox_insert(
        new.organization_id, new.quote_id, new.id, 'approval_waiting', v_recipient.email,
        v_recipient.user_id,
        'approval-waiting:' || new.id::text || ':'
          || pg_catalog.floor(extract(epoch from coalesce(new.submitted_at, pg_catalog.now())))::bigint::text
          || ':' || v_recipient.user_id::text,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'quote_number', new.snapshot #>> '{quote,number}',
          'customer_name', new.snapshot #>> '{buyer,name}',
          'revision_number', new.revision_number)),
        null, null);
    end loop;
  exception when others then
    raise warning 'email_outbox_enqueue_failed approval_waiting %', sqlstate;
  end;
  return new;
end;
$$;
create trigger quote_revisions_enqueue_approval_email
after update of state on public.quote_revisions
for each row
when (old.state is distinct from new.state and new.state = 'waiting' and new.snapshot is not null)
execute function public.enqueue_approval_waiting_email();

-- --------------------------------------- (a) issuer -> buyer (browser write path)
create view public.quote_buyer_email_requests
with (security_barrier = true) as
select
  outbox.id,
  outbox.quote_id,
  outbox.revision_id,
  null::integer as expected_version,
  outbox.recipient_email,
  outbox.share_expires_at as expires_at,
  null::uuid as command_id,
  outbox.status
from public.email_outbox outbox
where outbox.kind = 'quote_to_buyer'
  and public.has_org_capability(outbox.organization_id, 'quote.share');

create function public.enqueue_quote_email_to_buyer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_quote public.quotes%rowtype;
  v_revision public.quote_revisions%rowtype;
  v_timezone text;
  v_email text;
  v_key text;
  v_existing public.email_outbox%rowtype;
  v_id uuid;
begin
  if v_caller is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if new.command_id is null then
    raise exception using errcode = '22023', message = 'command_id_required';
  end if;
  select * into v_quote from public.quotes where id = new.quote_id for update;
  if v_quote.id is null or not public.has_org_capability(v_quote.organization_id, 'quote.share') then
    raise exception using errcode = '42501', message = 'quote_share_forbidden';
  end if;
  v_key := 'buyer-send:' || new.command_id::text;
  select * into v_existing from public.email_outbox where dedupe_key = v_key;
  if v_existing.id is not null then
    if v_existing.quote_id <> v_quote.id or v_existing.created_by is distinct from v_caller then
      raise exception using errcode = '22023', message = 'command_id_conflict';
    end if;
    new.id := v_existing.id;
    new.status := v_existing.status;
    new.recipient_email := v_existing.recipient_email;
    new.expires_at := v_existing.share_expires_at;
    return new;
  end if;

  if v_quote.version <> new.expected_version or v_quote.current_revision_id <> new.revision_id then
    raise exception using errcode = '40001', message = 'revision_stale';
  end if;
  if v_quote.accepted_revision_id is not null then
    raise exception using errcode = '55000', message = 'quote_already_accepted';
  end if;
  select * into v_revision from public.quote_revisions
  where id = new.revision_id and organization_id = v_quote.organization_id and quote_id = v_quote.id
  for update;
  if v_revision.id is null or v_revision.state <> 'issued' or v_revision.snapshot is null then
    raise exception using errcode = '55000', message = 'revision_not_issued';
  end if;
  select timezone into v_timezone from public.organizations where id = v_quote.organization_id;
  if v_revision.valid_until < public.organization_local_date(v_quote.organization_id, statement_timestamp()) then
    raise exception using errcode = '22023', message = 'QUOTE_EXPIRED';
  end if;
  if new.expires_at is null or new.expires_at <= statement_timestamp()
    or new.expires_at > ((v_revision.valid_until + 1)::timestamp at time zone v_timezone) then
    raise exception using errcode = '22023', message = 'share_expiry_invalid';
  end if;
  v_email := pg_catalog.lower(pg_catalog.btrim(coalesce(new.recipient_email, '')));
  if char_length(v_email) not between 3 and 254
    or v_email !~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+$' then
    raise exception using errcode = '22023', message = 'recipient_email_invalid';
  end if;
  -- Abuse bounds: this is an outbound mail relay for any holder of quote.share.
  if (select pg_catalog.count(*) from public.email_outbox
      where quote_id = v_quote.id and kind = 'quote_to_buyer'
        and created_at > pg_catalog.now() - interval '1 hour') >= 10
    or (select pg_catalog.count(*) from public.email_outbox
        where organization_id = v_quote.organization_id and kind = 'quote_to_buyer'
          and created_at > pg_catalog.now() - interval '1 day') >= 100 then
    raise exception using errcode = '54000', message = 'email_rate_limited';
  end if;

  v_id := public.outbox_insert(
    v_quote.organization_id, v_quote.id, v_revision.id, 'quote_to_buyer', v_email, null, v_key,
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'quote_number', v_quote.number,
      'seller_name', v_revision.snapshot #>> '{seller,legal_name}',
      'valid_until', v_revision.valid_until::text,
      'time_zone', v_timezone,
      'reply_to', nullif(btrim(coalesce(v_revision.snapshot #>> '{seller,contact_email}', '')), ''))),
    new.expires_at, v_caller);
  new.id := v_id;
  new.status := 'queued';
  new.recipient_email := v_email;
  return new;
end;
$$;
create trigger quote_buyer_email_requests_insert
instead of insert on public.quote_buyer_email_requests
for each row execute function public.enqueue_quote_email_to_buyer();

-- ------------------------------------------------ browser read path (the Emails list)
create view public.quote_email_activity
with (security_barrier = true) as
select
  outbox.id,
  outbox.organization_id,
  outbox.quote_id,
  outbox.revision_id,
  outbox.kind,
  outbox.audience,
  case when outbox.audience = 'buyer' then outbox.recipient_email else null end as recipient_email,
  case when outbox.audience = 'buyer' then outbox.recipient_email else 'Team notification' end
    as recipient_label,
  case
    when outbox.status in ('queued', 'sending', 'retry_wait') then 'queued'
    when outbox.status = 'sent' then 'sent'
    when outbox.status = 'dead' then 'failed'
    else 'cancelled'
  end as display_status,
  outbox.attempts,
  outbox.max_attempts,
  outbox.created_at,
  outbox.sent_at,
  outbox.dead_at,
  outbox.last_error_code
from public.email_outbox outbox
where public.has_org_capability(outbox.organization_id, 'quote.read');

-- ------------------------------------------------------------------ the worker
create function public.claim_email_outbox(p_limit integer, p_lease_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.email_outbox%rowtype;
  v_rows jsonb := '[]'::jsonb;
  v_attempt integer;
begin
  if p_limit is null or p_limit not between 1 and 100
    or p_lease_seconds is null or p_lease_seconds not between 10 and 600 then
    raise exception using errcode = '22023', message = 'outbox_claim_invalid';
  end if;
  for v_row in
    select * from public.email_outbox
    where (status in ('queued', 'retry_wait') and next_attempt_at <= v_now)
       or (status = 'sending' and locked_until < v_now)
    order by next_attempt_at, created_at
    limit p_limit
    for update skip locked
  loop
    -- An abandoned lease (a worker died mid-attempt) counts as a failed attempt.
    update public.email_outbox_attempts
    set finished_at = v_now, outcome = 'retry', error_code = 'lease_expired'
    where outbox_id = v_row.id and finished_at is null;
    if v_row.attempts >= v_row.max_attempts then
      update public.email_outbox
      set status = 'dead', dead_at = v_now, locked_until = null, last_error_code = 'lease_expired'
      where id = v_row.id;
      if v_row.share_link_id is not null then
        update public.quote_share_links
        set disabled_at = pg_catalog.now(), disabled_reason = 'revoked'
        where id = v_row.share_link_id and disabled_at is null;
      end if;
      continue;
    end if;
    v_attempt := v_row.attempts + 1;
    update public.email_outbox
    set status = 'sending', attempts = v_attempt,
        locked_until = v_now + pg_catalog.make_interval(secs => p_lease_seconds)
    where id = v_row.id;
    insert into public.email_outbox_attempts (outbox_id, attempt_no, started_at)
    values (v_row.id, v_attempt, v_now);
    v_rows := v_rows || pg_catalog.jsonb_build_object(
      'id', v_row.id, 'kind', v_row.kind, 'audience', v_row.audience,
      'recipient_email', v_row.recipient_email, 'payload', v_row.payload,
      'share_expires_at', v_row.share_expires_at, 'attempt_no', v_attempt,
      'organization_id', v_row.organization_id, 'quote_id', v_row.quote_id,
      'revision_id', v_row.revision_id);
  end loop;
  return v_rows;
end;
$$;

-- Mints the buyer link at delivery time; the secret is returned to the caller and never stored.
create function public.outbox_mint_share_link(p_outbox_id uuid, p_attempt_no integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_outbox public.email_outbox%rowtype;
  v_quote public.quotes%rowtype;
  v_revision public.quote_revisions%rowtype;
  v_timezone text;
  v_secret text;
  v_link_id uuid;
  v_selector uuid;
begin
  select * into v_outbox from public.email_outbox where id = p_outbox_id for update;
  if v_outbox.id is null or v_outbox.kind <> 'quote_to_buyer' or v_outbox.status <> 'sending'
    or v_outbox.attempts <> p_attempt_no then
    return pg_catalog.jsonb_build_object('status', 'ignored');
  end if;
  select * into v_quote from public.quotes
  where id = v_outbox.quote_id and organization_id = v_outbox.organization_id for update;
  select * into v_revision from public.quote_revisions
  where id = v_outbox.revision_id and quote_id = v_outbox.quote_id for update;
  select timezone into v_timezone from public.organizations where id = v_outbox.organization_id;
  if v_quote.id is null or v_revision.id is null
    or v_quote.current_revision_id is distinct from v_revision.id
    or v_revision.state <> 'issued'
    or v_quote.accepted_revision_id is not null
    or v_outbox.share_expires_at <= pg_catalog.clock_timestamp()
    or v_revision.valid_until < public.organization_local_date(v_quote.organization_id, pg_catalog.clock_timestamp())
    or v_outbox.share_expires_at > ((v_revision.valid_until + 1)::timestamp at time zone v_timezone) then
    return pg_catalog.jsonb_build_object('status', 'cancelled', 'code', 'link_unavailable');
  end if;
  -- A retried email never leaves two live links: the previous attempt's link is revoked.
  if v_outbox.share_link_id is not null then
    update public.quote_share_links
    set disabled_at = pg_catalog.now(), disabled_reason = 'revoked'
    where id = v_outbox.share_link_id and disabled_at is null;
  end if;
  v_secret := pg_catalog.translate(pg_catalog.rtrim(
    pg_catalog.encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_');
  insert into public.quote_share_links (
    organization_id, quote_id, revision_id, token_hash, recipient_email, expires_at, created_by
  ) values (
    v_outbox.organization_id, v_outbox.quote_id, v_outbox.revision_id,
    extensions.digest(pg_catalog.convert_to(v_secret, 'UTF8'), 'sha256'),
    v_outbox.recipient_email, v_outbox.share_expires_at, v_outbox.created_by
  ) returning id, selector into v_link_id, v_selector;
  update public.email_outbox set share_link_id = v_link_id where id = v_outbox.id;
  return pg_catalog.jsonb_build_object(
    'status', 'minted', 'selector', v_selector, 'secret', v_secret,
    'expires_at', v_outbox.share_expires_at);
end;
$$;

create function public.complete_email_outbox(
  p_outbox_id uuid,
  p_attempt_no integer,
  p_outcome text,
  p_provider_message_id text,
  p_error_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_outbox public.email_outbox%rowtype;
  v_backoff integer[] := array[60, 300, 1800, 7200, 21600];
  v_seconds integer;
  v_status text;
  v_outcome text := p_outcome;
begin
  if p_outcome not in ('sent', 'retry', 'dead', 'cancelled') then
    raise exception using errcode = '22023', message = 'outbox_outcome_invalid';
  end if;
  if p_error_code is not null and p_error_code !~ '^[a-z_]{3,40}$' then
    raise exception using errcode = '22023', message = 'outbox_error_code_invalid';
  end if;
  select * into v_outbox from public.email_outbox where id = p_outbox_id for update;
  if v_outbox.id is null or v_outbox.status <> 'sending' or v_outbox.attempts <> p_attempt_no then
    return pg_catalog.jsonb_build_object('status', 'ignored');
  end if;
  if p_outcome = 'sent' then
    update public.email_outbox
    set status = 'sent', sent_at = v_now, locked_until = null, last_error_code = null,
        provider_message_id = pg_catalog.left(p_provider_message_id, 200)
    where id = v_outbox.id;
    v_status := 'sent';
  elsif p_outcome = 'cancelled' then
    update public.email_outbox
    set status = 'cancelled', locked_until = null, last_error_code = p_error_code
    where id = v_outbox.id;
    v_status := 'cancelled';
  elsif p_outcome = 'dead' or v_outbox.attempts >= v_outbox.max_attempts then
    update public.email_outbox
    set status = 'dead', dead_at = v_now, locked_until = null, last_error_code = p_error_code
    where id = v_outbox.id;
    v_status := 'dead';
    v_outcome := 'dead';
  else
    v_seconds := v_backoff[least(v_outbox.attempts, 5)];
    update public.email_outbox
    set status = 'retry_wait', locked_until = null, last_error_code = p_error_code,
        next_attempt_at = v_now + pg_catalog.make_interval(
          secs => v_seconds * (0.8 + pg_catalog.random() * 0.4))
    where id = v_outbox.id;
    v_status := 'retry_wait';
  end if;
  -- An email that will never be sent must not leave a live link behind.
  if v_status in ('dead', 'cancelled') and v_outbox.share_link_id is not null then
    update public.quote_share_links
    set disabled_at = pg_catalog.now(), disabled_reason = 'revoked'
    where id = v_outbox.share_link_id and disabled_at is null;
  end if;
  update public.email_outbox_attempts
  set finished_at = v_now, outcome = v_outcome, error_code = p_error_code
  where outbox_id = v_outbox.id and attempt_no = p_attempt_no and finished_at is null;
  return pg_catalog.jsonb_build_object('status', v_status);
end;
$$;

-- ------------------------------------------------------------------- grants
revoke all on function
  public.guard_email_outbox(),
  public.guard_email_outbox_attempt(),
  public.outbox_insert(uuid, uuid, uuid, text, text, uuid, text, jsonb, timestamptz, uuid),
  public.enqueue_buyer_response_email(),
  public.enqueue_approval_waiting_email(),
  public.enqueue_quote_email_to_buyer(),
  public.claim_email_outbox(integer, integer),
  public.outbox_mint_share_link(uuid, integer),
  public.complete_email_outbox(uuid, integer, text, text, text)
from public, anon, authenticated, service_role;
grant execute on function
  public.claim_email_outbox(integer, integer),
  public.outbox_mint_share_link(uuid, integer),
  public.complete_email_outbox(uuid, integer, text, text, text)
to service_role;

revoke all on public.quote_buyer_email_requests, public.quote_email_activity
  from public, anon, authenticated;
grant select, insert on public.quote_buyer_email_requests to authenticated;
grant select on public.quote_email_activity to authenticated;

comment on table public.email_outbox is
  'Transactional email outbox. Rows are written in the transaction of the business event, drained by a separate worker, retained indefinitely and never deleted. Holds no secret: buyer links are minted at delivery.';
comment on view public.quote_email_activity is
  'Emails list for the quote page. Internal recipient addresses are never exposed: audience internal returns a fixed label and a null address.';
comment on function public.outbox_mint_share_link(uuid, integer) is
  'service_role only. Creates the buyer share link at delivery time and returns its secret once; the secret is not stored.';

commit;
