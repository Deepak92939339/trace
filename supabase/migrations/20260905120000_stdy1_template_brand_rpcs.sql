-- Verified locally (pgTAP + psql proofs); never applied to a hosted database — capability-checked Studio template, brand and activity RPCs.
begin;
create function public.studio_require(p_organization_id uuid, p_capability text) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if p_organization_id is null or not public.has_org_capability(p_organization_id,p_capability) then
   raise exception using errcode = '42501', message = 'studio_forbidden';
 end if;
end;
$$;
create function public.studio_current_org(p_capability text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare org uuid;
begin
 select organization_id into org from public.organization_memberships
 where user_id = auth.uid() and status = 'active' order by created_at, organization_id limit 1;
 perform public.studio_require(org,p_capability);
 return org;
end;
$$;
create function public.studio_lock(p_org uuid) returns void
language sql security definer set search_path = '' as $$
 select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('studio:' || p_org::text,0))
$$;
create function public.studio_log(p_org uuid,p_action text,p_type text,p_subject uuid,p_detail jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
 insert into public.studio_activity(organization_id,actor_id,action,subject_type,subject_id,detail)
 values (p_org,auth.uid(),p_action,p_type,p_subject,p_detail)
$$;
create function public.list_document_templates() returns setof public.document_templates
language plpgsql stable security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.read');
begin
 return query select t.* from public.document_templates t where t.organization_id = org and t.archived_at is null order by t.created_at,t.id;
end;
$$;
create function public.get_document_template(p_id uuid) returns public.document_templates
language plpgsql stable security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.read'); t public.document_templates;
begin
 select * into t from public.document_templates where id = p_id and organization_id = org;
 if t.id is null then raise exception using errcode = '42501', message = 'studio_forbidden'; end if;
 return t;
end;
$$;
create function public.create_document_template(p_name text,p_base_key text,p_layout jsonb) returns public.document_templates
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.manage'); t public.document_templates;
begin
 perform public.studio_lock(org);
 if not public.studio_layout_is_valid(p_layout) then raise exception using errcode = '22023', message = 'studio_layout_invalid'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 80 or public.studio_system_layout(p_base_key) is null then
   raise exception using errcode = '22023', message = 'studio_template_invalid';
 end if;
 insert into public.document_templates(organization_id,name,base_template_key,layout,created_by,updated_by)
 values (org,btrim(p_name),p_base_key,p_layout,auth.uid(),auth.uid()) returning * into t;
 insert into public.document_template_versions(organization_id,template_id,version,layout,saved_by) values (org,t.id,t.version,t.layout,auth.uid());
 perform public.studio_log(org,'template.created','template',t.id);
 return t;
end;
$$;
create function public.save_document_template(p_id uuid,p_expected_version integer,p_layout jsonb) returns public.document_templates
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.manage'); t public.document_templates;
begin
 perform public.studio_lock(org);
 select * into t from public.document_templates where id = p_id and organization_id = org and archived_at is null for update;
 if t.id is null then raise exception using errcode = '42501', message = 'studio_forbidden'; end if;
 if p_expected_version is distinct from t.version then raise exception using errcode = '40001', message = 'template_version_conflict'; end if;
 if not public.studio_layout_is_valid(p_layout) then raise exception using errcode = '22023', message = 'studio_layout_invalid'; end if;
 update public.document_templates set layout = p_layout, version = version + 1, updated_by = auth.uid(),updated_at = clock_timestamp() where id = t.id returning * into t;
 insert into public.document_template_versions(organization_id,template_id,version,layout,saved_by) values (org,t.id,t.version,t.layout,auth.uid());
 perform public.studio_log(org,'template.updated','template',t.id,jsonb_build_object('version',t.version));
 return t;
end;
$$;
create function public.duplicate_document_template(p_id_or_base_key text,p_name text) returns public.document_templates
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.manage'); src public.document_templates; t public.document_templates; l jsonb; base text;
begin
 perform public.studio_lock(org);
 l := public.studio_system_layout(p_id_or_base_key); base := p_id_or_base_key;
 if l is null then
   select * into src from public.document_templates where id::text = p_id_or_base_key and organization_id = org and archived_at is null;
   if src.id is null then raise exception using errcode = '42501', message = 'studio_forbidden'; end if;
   l := src.layout; base := src.base_template_key;
 end if;
 t := public.create_document_template(p_name,base,l);
 perform public.studio_log(org,'template.duplicated','template',t.id);
 return t;
end;
$$;
create function public.archive_document_template(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.manage');
begin
 perform public.studio_lock(org);
 update public.document_templates set archived_at = clock_timestamp(),is_default = false,updated_by = auth.uid(),updated_at = clock_timestamp()
 where id = p_id and organization_id = org and archived_at is null;
 if not found then raise exception using errcode = '42501', message = 'studio_forbidden'; end if;
 perform public.studio_log(org,'template.archived','template',p_id);
end;
$$;
create function public.set_default_document_template(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.manage');
begin
 perform public.studio_lock(org);
 if not exists (select 1 from public.document_templates where id = p_id and organization_id = org and archived_at is null) then
   raise exception using errcode = '42501', message = 'studio_forbidden';
 end if;
 update public.document_templates set is_default = false,updated_by = auth.uid(),updated_at = clock_timestamp() where organization_id = org and is_default;
 update public.document_templates set is_default = true,updated_by = auth.uid(),updated_at = clock_timestamp() where organization_id = org and id = p_id;
 perform public.studio_log(org,'template.default_set','template',p_id);
end;
$$;
create function public.get_organization_brand() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.read'); b jsonb;
begin
 select jsonb_build_object('primary',primary_color,'accent',accent_color,'font',font,'logo_asset_id',logo_asset_id,'footer_line',footer_line,'registration_line',registration_line)
 into b from public.organization_brand where organization_id = org;
 return coalesce(b,'{"primary":"#216b46","accent":"#b45309","font":"sans","logo_asset_id":null,"footer_line":"","registration_line":""}'::jsonb);
end;
$$;
create function public.save_organization_brand(p_brand jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('brand.manage'); logo uuid;
begin
 perform public.studio_lock(org);
 if not public.studio_object_keys(p_brand,array['primary','accent','font','logo_asset_id','footer_line','registration_line'])
   or (select count(*) from pg_catalog.jsonb_object_keys(p_brand)) <> 6
   or not coalesce(p_brand ->> 'primary' ~ '^#[0-9a-f]{6}$',false)
   or not coalesce(p_brand ->> 'accent' ~ '^#[0-9a-f]{6}$',false)
   or not coalesce(p_brand ->> 'font' in ('sans','serif','mono-accent'),false)
   or pg_catalog.jsonb_typeof(p_brand -> 'footer_line') is distinct from 'string'
   or pg_catalog.jsonb_typeof(p_brand -> 'registration_line') is distinct from 'string'
   or char_length(p_brand ->> 'footer_line') > 200 or char_length(p_brand ->> 'registration_line') > 200 then
   raise exception using errcode = '22023', message = 'studio_brand_invalid';
 end if;
 if p_brand -> 'logo_asset_id' <> 'null'::jsonb then
   if pg_catalog.jsonb_typeof(p_brand -> 'logo_asset_id') <> 'string' or not coalesce(p_brand ->> 'logo_asset_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',false) then
     raise exception using errcode = '22023', message = 'studio_brand_invalid';
   end if;
   logo := (p_brand ->> 'logo_asset_id')::uuid;
   if not exists (select 1 from public.document_assets where id = logo and organization_id = org) then
     raise exception using errcode = '42501', message = 'studio_forbidden';
   end if;
 end if;
 insert into public.organization_brand(organization_id,primary_color,accent_color,font,logo_asset_id,footer_line,registration_line,updated_by)
 values (org,p_brand ->> 'primary',p_brand ->> 'accent',p_brand ->> 'font',logo,p_brand ->> 'footer_line',p_brand ->> 'registration_line',auth.uid())
 on conflict (organization_id) do update set primary_color = excluded.primary_color,accent_color = excluded.accent_color,font = excluded.font,logo_asset_id = excluded.logo_asset_id,footer_line = excluded.footer_line,registration_line = excluded.registration_line,updated_by = excluded.updated_by,updated_at = clock_timestamp();
 perform public.studio_log(org,'brand.updated','brand',org);
 return public.get_organization_brand();
end;
$$;
create function public.list_studio_activity(p_limit integer default 50) returns setof public.studio_activity
language plpgsql stable security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.read');
begin
 if p_limit is null or p_limit not between 1 and 200 then raise exception using errcode = '22023', message = 'studio_limit_invalid'; end if;
 return query select a.* from public.studio_activity a where a.organization_id = org order by a.created_at desc,a.id desc limit p_limit;
end;
$$;
revoke all on function public.studio_require(uuid,text),public.studio_current_org(text),public.studio_lock(uuid),public.studio_log(uuid,text,text,uuid,jsonb),
 public.list_document_templates(),public.get_document_template(uuid),public.create_document_template(text,text,jsonb),public.save_document_template(uuid,integer,jsonb),public.duplicate_document_template(text,text),public.archive_document_template(uuid),public.set_default_document_template(uuid),public.get_organization_brand(),public.save_organization_brand(jsonb),public.list_studio_activity(integer) from public,anon,authenticated,service_role;
grant execute on function public.list_document_templates(),public.get_document_template(uuid),public.create_document_template(text,text,jsonb),public.save_document_template(uuid,integer,jsonb),public.duplicate_document_template(text,text),public.archive_document_template(uuid),public.set_default_document_template(uuid),public.get_organization_brand(),public.save_organization_brand(jsonb),public.list_studio_activity(integer) to authenticated;
commit;
