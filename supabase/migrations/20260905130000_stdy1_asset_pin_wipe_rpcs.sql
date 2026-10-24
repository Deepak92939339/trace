-- WRITTEN, NOT EXECUTED — asset byte defence, server-selected pinning, export throttle and wipe hook.
begin;
create function public.create_document_asset(p_mime text,p_bytes bytea,p_sha256 text) returns public.document_assets
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('brand.manage'); a public.document_assets; svg text; body text; size integer := octet_length(p_bytes);
begin
 perform public.studio_lock(org);
 if p_mime is null or p_mime not in ('image/png','image/jpeg','image/webp','image/svg+xml')
   or size is null or size not between 1 and 524288 or (p_mime = 'image/svg+xml' and size > 131072)
   or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' or p_sha256 <> public.sha256_hex(p_bytes) then
   raise exception using errcode = '22023', message = 'studio_asset_invalid';
 end if;
 if (p_mime = 'image/png' and substring(p_bytes from 1 for 8) <> decode('89504e470d0a1a0a','hex'))
   or (p_mime = 'image/jpeg' and substring(p_bytes from 1 for 3) <> decode('ffd8ff','hex'))
   or (p_mime = 'image/webp' and (size < 12 or substring(p_bytes from 1 for 4) <> decode('52494646','hex') or substring(p_bytes from 9 for 4) <> decode('57454250','hex'))) then
   raise exception using errcode = '22023', message = 'studio_asset_magic_invalid';
 end if;
 if p_mime = 'image/svg+xml' then
   begin svg := pg_catalog.convert_from(p_bytes,'UTF8'); exception when others then
     raise exception using errcode = '22023', message = 'studio_asset_svg_invalid'; end;
   svg := pg_catalog.ltrim(svg,chr(65279) || E' \t\r\n');
   -- SQL is defence in depth. Application upload AND every render use the stricter allowlist.
   if svg !~* '^<svg([[:space:]>/])|^<\?xml([[:space:]?])' then
     raise exception using errcode = '22023', message = 'studio_asset_svg_invalid';
   end if;
   -- Same closed grammar as lib/studio/assets.ts, as a second layer: only the canonical XML declaration, allowlisted element names,
   -- no DTD/PI/comment/CDATA, no character or unknown entity references, no prefixed attributes, only local url(#id) references.
   body := pg_catalog.regexp_replace(svg,'^<\?xml[[:space:]]+version=["'']1\.0["''][[:space:]]*(encoding=["'']UTF-8["''])?[[:space:]]*\?>[[:space:]]*','');
   if body ~ '<[!?]' or body ~* 'javascript[[:space:]]*:' or body ~* '(^|[^a-z])on[a-z]+[[:space:]]*='
     or body ~ '&(?!(amp|lt|gt|quot|apos);)' or body ~* '[[:alnum:]_.-]+:[[:alnum:]_.-]+[[:space:]]*=' or body ~* '[[:space:]]href[[:space:]]*='
     or body ~ 'xmlns[[:space:]]*=[[:space:]]*["''](?!http://www\.w3\.org/2000/svg["''])'
     or body ~* 'url[[:space:]]*\([[:space:]]*(?!#)' or body ~* '@import'
     or exists (select 1 from pg_catalog.regexp_matches(body,'<[[:space:]]*/?[[:space:]]*([^[:space:]/>]+)','g') m
                where m[1] <> all (array['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','defs','linearGradient','radialGradient','stop','clipPath','title','desc'])) then
     raise exception using errcode = '22023', message = 'studio_asset_svg_invalid';
   end if;
 end if;
 insert into public.document_assets(organization_id,mime,byte_length,sha256,created_by)
 values (org,p_mime,size,p_sha256,auth.uid()) returning * into a;
 insert into public.document_asset_blobs(asset_id,organization_id,bytes) values (a.id,org,p_bytes);
 perform public.studio_log(org,'asset.uploaded','asset',a.id,jsonb_build_object('mime',p_mime,'byte_length',size));
 return a;
end;
$$;
create function public.list_document_assets()
returns table (id uuid,mime text,byte_length integer,created_at timestamptz,is_brand_logo boolean,pinned_revision_count bigint)
language plpgsql stable security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.read');
begin
 return query select a.id,a.mime,a.byte_length,a.created_at,
   exists(select 1 from public.organization_brand b where b.organization_id=org and b.logo_asset_id=a.id),
   (select count(*) from public.quote_revision_layout_assets l where l.organization_id=org and l.asset_id=a.id)
 from public.document_assets a where a.organization_id=org order by a.created_at,a.id;
end;
$$;
create function public.read_document_asset(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('template.read'); result jsonb;
begin
 select jsonb_build_object('id',a.id,'mime',a.mime,'sha256',a.sha256,'byte_length',a.byte_length,'base64',replace(encode(b.bytes,'base64'),E'\n',''))
 into result from public.document_assets a join public.document_asset_blobs b on b.asset_id = a.id and b.organization_id = a.organization_id
 where a.organization_id = org and a.id = p_id;
 if result is null then raise exception using errcode = '42501', message = 'studio_forbidden'; end if;
 return result;
end;
$$;
create function public.delete_document_asset(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('brand.manage');
begin
 perform public.studio_lock(org);
 if not exists (select 1 from public.document_assets where id = p_id and organization_id = org) then
   raise exception using errcode = '42501', message = 'studio_forbidden';
 end if;
 if exists (select 1 from public.quote_revision_layout_assets where organization_id = org and asset_id = p_id)
   or exists (select 1 from public.organization_brand where organization_id = org and logo_asset_id = p_id) then
   raise exception using errcode = '55000', message = 'studio_asset_in_use';
 end if;
 delete from public.document_asset_blobs where asset_id = p_id and organization_id = org;
 delete from public.document_assets where id = p_id and organization_id = org;
 perform public.studio_log(org,'asset.deleted','asset',p_id);
end;
$$;
create function public.pin_revision_layout(p_revision_id uuid) returns public.quote_revision_layouts
language plpgsql security definer set search_path = '' as $$
declare r public.quote_revisions; t public.document_templates; pinned public.quote_revision_layouts; b jsonb; logo uuid; org uuid := public.studio_current_org('quote.print');
begin
 -- Organization lock precedes all row locks, matching Studio save/default/brand/asset RPCs.
 perform public.studio_lock(org);
 select * into r from public.quote_revisions where id = p_revision_id and organization_id = org;
 if r.id is null then raise exception using errcode = '42501', message = 'studio_forbidden'; end if;
 if r.state <> 'issued' or r.snapshot is null or r.snapshot_hash is null or r.issued_at is null then
   raise exception using errcode = '55000', message = 'studio_revision_not_issued';
 end if;
 select * into pinned from public.quote_revision_layouts where revision_id = r.id and organization_id = org;
 if pinned.revision_id is not null then return pinned; end if;
 select * into t from public.document_templates where organization_id = org and is_default and archived_at is null;
 -- Historical/registered output and absent/invalid defaults are pinned legacy forever.
 if r.issued_at < coalesce((select installed_at from public.studio_rollout where singleton),'infinity'::timestamptz)
   or exists (select 1 from public.quote_revision_pdfs where revision_id = r.id)
   or t.id is null or not coalesce(public.studio_layout_is_valid(t.layout),false) then
   insert into public.quote_revision_layouts(revision_id,organization_id,quote_id,snapshot_hash,kind,template_id,template_version,layout,brand,layout_hash,pinned_by)
   values (r.id,org,r.quote_id,r.snapshot_hash,'legacy',null,1,null,null,
     public.sha256_hex(public.canonical_json_v1(jsonb_build_object('kind','legacy'))),auth.uid()) returning * into pinned;
   perform public.studio_log(org,'layout.pinned','revision',r.id,jsonb_build_object('kind','legacy','layout_hash',pinned.layout_hash));
   return pinned;
 end if;
 select jsonb_build_object('primary',primary_color,'accent',accent_color,'font',font,'logo_asset_id',logo_asset_id,'footer_line',footer_line,'registration_line',registration_line) into b from public.organization_brand where organization_id = org;
 b := coalesce(b,'{"primary":"#216b46","accent":"#b45309","font":"sans","logo_asset_id":null,"footer_line":"","registration_line":""}'::jsonb);
 logo := (b ->> 'logo_asset_id')::uuid;
 insert into public.quote_revision_layouts(revision_id,organization_id,quote_id,snapshot_hash,kind,template_id,template_version,layout,brand,layout_hash,pinned_by)
 values (r.id,org,r.quote_id,r.snapshot_hash,'studio',t.id,t.version,t.layout,b,
   public.sha256_hex(public.canonical_json_v1(jsonb_build_object('layout',t.layout,'brand',b))),auth.uid()) returning * into pinned;
 if logo is not null then insert into public.quote_revision_layout_assets(organization_id,revision_id,asset_id) values (org,r.id,logo); end if;
 perform public.studio_log(org,'layout.pinned','revision',r.id,jsonb_build_object('template_id',t.id,'version',t.version,'layout_hash',pinned.layout_hash));
 return pinned;
end;
$$;
create function public.get_revision_layout(p_revision_id uuid) returns public.quote_revision_layouts
language plpgsql stable security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('quote.read'); result public.quote_revision_layouts;
begin
 perform public.studio_require(org,'template.read');
 if not exists (select 1 from public.quote_revisions where id = p_revision_id and organization_id = org and state = 'issued' and snapshot_hash is not null and issued_at is not null) then
   raise exception using errcode = '42501', message = 'studio_forbidden';
 end if;
 select * into result from public.quote_revision_layouts where revision_id = p_revision_id and organization_id = org;
 return result;
end;
$$;
create function public.request_workspace_export() returns void
language plpgsql security definer set search_path = '' as $$
declare org uuid := public.studio_current_org('workspace.export'); previous timestamptz; stamp timestamptz;
begin
 perform public.studio_require(org,'organization.manage');
 perform public.studio_lock(org); stamp := clock_timestamp();
 select requested_at into previous from public.studio_export_attempts where organization_id = org;
 if previous > stamp - interval '60 seconds' then raise exception using errcode = '54000', message = 'studio_export_rate_limited'; end if;
 insert into public.studio_export_attempts(organization_id,requested_at,requested_by) values (org,stamp,auth.uid())
 on conflict (organization_id) do update set requested_at = excluded.requested_at,requested_by = excluded.requested_by;
 perform public.studio_log(org,'export.requested','workspace',org);
end;
$$;
create function public.studio_wipe_organization(p_organization_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
 perform public.studio_lock(p_organization_id);
 if not public.studio_destroy_allowed(p_organization_id) then raise exception using errcode = '55000', message = 'studio_wipe_not_allowed'; end if;
 delete from public.quote_revision_layout_assets where organization_id = p_organization_id;
 delete from public.quote_revision_layouts where organization_id = p_organization_id;
 delete from public.studio_activity where organization_id = p_organization_id;
 delete from public.document_template_versions where organization_id = p_organization_id;
 delete from public.document_templates where organization_id = p_organization_id;
 delete from public.organization_brand where organization_id = p_organization_id;
 delete from public.document_asset_blobs where organization_id = p_organization_id;
 delete from public.document_assets where organization_id = p_organization_id;
 delete from public.studio_export_attempts where organization_id = p_organization_id;
end;
$$;
revoke all on function public.list_document_assets(),public.create_document_asset(text,bytea,text),public.read_document_asset(uuid),public.delete_document_asset(uuid),public.pin_revision_layout(uuid),public.get_revision_layout(uuid),public.request_workspace_export(),public.studio_wipe_organization(uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_document_assets(),public.create_document_asset(text,bytea,text),public.read_document_asset(uuid),public.delete_document_asset(uuid),public.pin_revision_layout(uuid),public.get_revision_layout(uuid),public.request_workspace_export() to authenticated;
commit;
