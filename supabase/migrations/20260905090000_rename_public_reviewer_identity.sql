-- Renames the published read-only reviewer from the Tender-era address to the Trace one.
-- Like 20260826091000_public_demo_reviewer_identity.sql this is deliberately inert unless the
-- dedicated fictional demo organization already exists, so ordinary installations are untouched.
-- The credential is public by design; the reviewer role stays the authorization boundary.
--
--   old: demo.reviewer@tender.example.test
--   new: demo.reviewer@trace.example.test   (password published on the sign-in page)
--
-- The existing reviewer row is renamed in place (same user id, membership and profile). Safe to
-- re-run: when the new address already exists nothing is created twice.
do $reviewer$
declare
  old_email constant text := 'demo.reviewer@tender.example.test';
  new_email constant text := 'demo.reviewer@trace.example.test';
  demo_organization_id uuid;
  reviewer_role_id uuid;
  reviewer_user_id uuid;
begin
  select organization.id
  into demo_organization_id
  from public.organizations organization
  where organization.slug = 'northstar-industrial-demo';

  if demo_organization_id is null then
    raise notice 'Public demo organization absent; reviewer rename skipped.';
    return;
  end if;

  select role.id into reviewer_role_id from public.roles role where role.key = 'reviewer';
  if reviewer_role_id is null then
    raise exception 'reviewer_role_missing';
  end if;

  select auth_user.id
  into reviewer_user_id
  from auth.users auth_user
  where lower(auth_user.email) = new_email;

  if reviewer_user_id is null then
    select auth_user.id
    into reviewer_user_id
    from auth.users auth_user
    where lower(auth_user.email) = old_email;
  end if;

  if reviewer_user_id is null then
    reviewer_user_id := '55555555-5555-4555-8555-555555555555'::uuid;
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, raw_app_meta_data,
      raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      reviewer_user_id,
      'authenticated',
      'authenticated',
      new_email,
      extensions.crypt('TraceReview2026!', extensions.gen_salt('bf')),
      now(), '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Rhea Reviewer"}'::jsonb,
      now(), now()
    );
  else
    update auth.users
    set email = new_email,
        encrypted_password = extensions.crypt(
          'TraceReview2026!',
          extensions.gen_salt('bf')
        ),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || '{"display_name":"Rhea Reviewer"}'::jsonb,
        updated_at = now()
    where id = reviewer_user_id;
  end if;

  insert into auth.identities (
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    reviewer_user_id::text,
    reviewer_user_id,
    jsonb_build_object(
      'sub', reviewer_user_id::text,
      'email', new_email,
      'email_verified', true,
      'phone_verified', false
    ),
    'email', now(), now(), now()
  )
  on conflict (provider_id, provider) do update
  set identity_data = excluded.identity_data,
      updated_at = now();

  insert into public.organization_memberships (
    organization_id, user_id, role_id, status
  ) values (
    demo_organization_id, reviewer_user_id, reviewer_role_id, 'active'
  )
  on conflict (organization_id, user_id) do update
  set role_id = excluded.role_id,
      status = excluded.status;
end;
$reviewer$;
