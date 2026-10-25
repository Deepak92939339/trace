-- Verified locally (pgTAP + psql proofs); never applied to a hosted database — Studio tables, tenant keys, capabilities and immutable guards.
begin;
insert into public.capabilities (key, label) values
 ('template.read','Read document templates'), ('template.manage','Create and edit document templates'),
 ('brand.manage','Manage brand and logo'), ('workspace.export','Export workspace data');
insert into public.role_capabilities (role_id, capability_key)
select r.id, c.key from public.roles r cross join public.capabilities c
where (c.key = 'template.read' and r.key in ('operator','manager','organization_admin','reviewer'))
 or (c.key = 'template.manage' and r.key in ('manager','organization_admin'))
 or (c.key in ('brand.manage','workspace.export') and r.key = 'organization_admin');

-- Installation time, rather than an assumed deployment date, separates historical revisions.
-- Singleton is private, global metadata, not organization data; it is never wiped.
create table public.studio_rollout (
 singleton boolean primary key default true check (singleton),
 installed_at timestamptz not null default clock_timestamp()
);
insert into public.studio_rollout (singleton) values (true);
create table public.document_assets (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 kind text not null default 'logo' check (kind = 'logo'),
 mime text not null check (mime in ('image/png','image/jpeg','image/webp','image/svg+xml')),
 byte_length integer not null check (byte_length between 1 and 524288 and (mime <> 'image/svg+xml' or byte_length <= 131072)),
 sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 unique (organization_id, id)
);
create table public.document_asset_blobs (
 asset_id uuid primary key, organization_id uuid not null, bytes bytea not null,
 foreign key (organization_id, asset_id) references public.document_assets(organization_id,id)
);
create table public.organization_brand (
 organization_id uuid primary key references public.organizations(id),
 primary_color text not null default '#216b46' check (primary_color ~ '^#[0-9a-f]{6}$'),
 accent_color text not null default '#b45309' check (accent_color ~ '^#[0-9a-f]{6}$'),
 font text not null default 'sans' check (font in ('sans','serif','mono-accent')),
 logo_asset_id uuid, footer_line text not null default '' check (char_length(footer_line) <= 200),
 registration_line text not null default '' check (char_length(registration_line) <= 200),
 updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 foreign key (organization_id, logo_asset_id) references public.document_assets(organization_id,id)
);
create table public.document_templates (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check (char_length(btrim(name)) between 1 and 80),
 base_template_key text not null check (base_template_key in ('classic','modern','industrial','compact','exec','project','showcase','dark')),
 layout jsonb not null check (public.studio_layout_is_valid(layout)),
 version integer not null default 1 check (version > 0), is_default boolean not null default false,
 created_by uuid not null references auth.users(id), updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 unique (organization_id,id), check (archived_at is null or not is_default)
);
create unique index document_templates_one_default on public.document_templates(organization_id) where is_default and archived_at is null;
create index document_templates_org_created on public.document_templates(organization_id,created_at,id);
create table public.document_template_versions (
 organization_id uuid not null, template_id uuid not null, version integer not null check (version > 0),
 layout jsonb not null check (public.studio_layout_is_valid(layout)),
 saved_by uuid not null references auth.users(id), saved_at timestamptz not null default now(),
 primary key (template_id,version), unique (organization_id,template_id,version),
 foreign key (organization_id,template_id) references public.document_templates(organization_id,id)
);
create table public.studio_activity (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references auth.users(id),
 action text not null check (action in ('template.created','template.updated','template.duplicated','template.archived','template.default_set','asset.uploaded','asset.deleted','brand.updated','export.requested','layout.pinned')),
 subject_type text not null check (subject_type in ('template','brand','asset','revision','workspace')),
 subject_id uuid not null,
 detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object' and octet_length(detail::text) <= 2048),
 created_at timestamptz not null default now()
);
create index studio_activity_org_created on public.studio_activity(organization_id,created_at desc,id desc);
create table public.quote_revision_layouts (
 revision_id uuid primary key, organization_id uuid not null, quote_id uuid not null,
 snapshot_hash char(64) not null check (snapshot_hash ~ '^[0-9a-f]{64}$'), template_id uuid,
 template_version integer not null check (template_version > 0),
 kind text not null check (kind in ('studio','legacy')), layout jsonb, brand jsonb,
 -- No studio_layout_is_valid() here: pinned rows are immutable for years and a later, stricter validator must never make a restore fail. pin_revision_layout validates before inserting.
 check ((kind = 'studio' and layout is not null and brand is not null and template_id is not null)
     or (kind = 'legacy' and layout is null and brand is null and template_id is null)),
 layout_hash char(64) not null check (layout_hash ~ '^[0-9a-f]{64}$'),
 pinned_by uuid not null references auth.users(id), pinned_at timestamptz not null default now(),
 unique (organization_id,revision_id),
 foreign key (organization_id,quote_id,revision_id,snapshot_hash) references public.quote_revisions(organization_id,quote_id,id,snapshot_hash),
 foreign key (organization_id,template_id,template_version) references public.document_template_versions(organization_id,template_id,version)
);
create index quote_revision_layouts_org_quote on public.quote_revision_layouts(organization_id,quote_id);
create table public.quote_revision_layout_assets (
 organization_id uuid not null, revision_id uuid not null, asset_id uuid not null,
 primary key (revision_id,asset_id),
 foreign key (organization_id,revision_id) references public.quote_revision_layouts(organization_id,revision_id),
 foreign key (organization_id,asset_id) references public.document_assets(organization_id,id) on delete restrict
);
create index quote_revision_layout_assets_asset on public.quote_revision_layout_assets(organization_id,asset_id);
create table public.studio_export_attempts (
 organization_id uuid primary key references public.organizations(id),
 requested_at timestamptz not null, requested_by uuid not null references auth.users(id)
);

create function public.studio_destroy_allowed(p_organization_id uuid) returns boolean
language sql security definer set search_path = '' as $$ select false $$;
create function public.studio_guard_immutable() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if tg_op = 'DELETE' then
   if public.studio_destroy_allowed(old.organization_id) then return old; end if;
 end if;
 raise exception using errcode = '55000', message = 'studio_immutable';
end;
$$;
create function public.studio_guard_asset() returns trigger
language plpgsql set search_path = '' as $$
begin
 if tg_op = 'UPDATE' or tg_op = 'TRUNCATE' then
   raise exception using errcode = '55000', message = 'studio_asset_immutable';
 end if;
 return old;
end;
$$;
create function public.studio_guard_caps() returns trigger
language plpgsql set search_path = '' as $$
begin
 -- Same organization lock as every Studio mutation. Caps hold across concurrent clients.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('studio:' || new.organization_id::text,0));
 if tg_table_name = 'document_templates' then
   if new.archived_at is null and (select count(*) from public.document_templates where organization_id = new.organization_id and archived_at is null and id <> new.id) >= 25 then
     raise exception using errcode = '54000', message = 'template_limit_reached';
   end if;
 else
   if (select count(*) from public.document_assets where organization_id = new.organization_id and id <> new.id) >= 8 then
     raise exception using errcode = '54000', message = 'asset_limit_reached';
   end if;
 end if;
 return new;
end;
$$;
create trigger document_templates_cap before insert or update on public.document_templates for each row execute function public.studio_guard_caps();
create trigger document_assets_cap before insert on public.document_assets for each row execute function public.studio_guard_caps();

-- Deliberately no application role has write or truncate grants, even on mutable tables.
do $$
declare t text;
begin
 foreach t in array array['document_template_versions','studio_activity','quote_revision_layouts','quote_revision_layout_assets'] loop
   execute format('create trigger %I before update or delete on public.%I for each row execute function public.studio_guard_immutable()', t || '_immutable', t);
   execute format('create trigger %I before truncate on public.%I for each statement execute function public.studio_guard_immutable()', t || '_no_truncate', t);
 end loop;
 foreach t in array array['document_assets','document_asset_blobs'] loop
   execute format('create trigger %I before update on public.%I for each row execute function public.studio_guard_asset()', t || '_immutable', t);
   execute format('create trigger %I before truncate on public.%I for each statement execute function public.studio_guard_asset()', t || '_no_truncate', t);
 end loop;
 foreach t in array array['studio_rollout','document_assets','document_asset_blobs','organization_brand','document_templates','document_template_versions','studio_activity','quote_revision_layouts','quote_revision_layout_assets','studio_export_attempts'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
 end loop;
 foreach t in array array['document_assets','organization_brand','document_templates','document_template_versions','studio_activity'] loop
   execute format('create policy %I on public.%I for select to authenticated using (public.has_org_capability(organization_id, ''template.read''))',t || '_read',t);
   execute format('grant select on public.%I to authenticated',t);
 end loop;
 foreach t in array array['quote_revision_layouts','quote_revision_layout_assets'] loop
   execute format('create policy %I on public.%I for select to authenticated using (public.has_org_capability(organization_id, ''quote.print''))',t || '_read',t);
   execute format('grant select on public.%I to authenticated',t);
 end loop;
end;
$$;
create function public.studio_guard_blob_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 if exists (select 1 from public.quote_revision_layout_assets l where l.organization_id = old.organization_id and l.asset_id = old.asset_id)
    and not public.studio_destroy_allowed(old.organization_id) then
   raise exception using errcode = '55000', message = 'studio_asset_in_use';
 end if;
 return old;
end;
$$;
create trigger document_asset_blobs_in_use before delete on public.document_asset_blobs for each row execute function public.studio_guard_blob_delete();
-- Guards must also fire under session_replication_role = replica.
do $$
declare t text;
begin
 foreach t in array array['document_template_versions','studio_activity','quote_revision_layouts','quote_revision_layout_assets'] loop
   execute format('alter table public.%I enable always trigger %I, enable always trigger %I',t,t||'_immutable',t||'_no_truncate');
 end loop;
 foreach t in array array['document_assets','document_asset_blobs'] loop
   execute format('alter table public.%I enable always trigger %I, enable always trigger %I',t,t||'_immutable',t||'_no_truncate');
 end loop;
 alter table public.document_asset_blobs enable always trigger document_asset_blobs_in_use;
end;
$$;
revoke all on function public.studio_destroy_allowed(uuid), public.studio_guard_immutable(), public.studio_guard_asset(), public.studio_guard_caps(), public.studio_guard_blob_delete() from public, anon, authenticated, service_role;
commit;
