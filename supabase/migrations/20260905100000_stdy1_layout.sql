-- WRITTEN, NOT EXECUTED — Studio schema v1; kept in sync with lib/studio/layout-schema.ts.
begin;
create function public.studio_object_keys(p_value jsonb, p_keys text[]) returns boolean
language sql immutable set search_path = '' as $$
 select coalesce(pg_catalog.jsonb_typeof(p_value) = 'object'
   and not exists (select 1 from pg_catalog.jsonb_object_keys(p_value) k where not (k = any(p_keys))), false)
$$;
create function public.studio_layout_is_valid(p_layout jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare b jsonb; p jsonb; k text; r jsonb; rules jsonb; seen text[] := '{}'; singles text[] := '{}'; item jsonb;
begin
 -- cheap bound first: canonical_json_v1 is quadratic in string length, so never feed it an oversized document
 if p_layout is null or pg_catalog.jsonb_typeof(p_layout) <> 'object' or pg_catalog.octet_length(p_layout::text) > 196608 then return false; end if;
 if pg_catalog.octet_length(public.canonical_json_v1(p_layout)) > 65536
   or not public.studio_object_keys(p_layout, array['v','page','style','blocks'])
   or p_layout -> 'v' is distinct from '1'::jsonb
   or not public.studio_object_keys(p_layout -> 'page', array['size','margin'])
   or not coalesce(p_layout #>> '{page,size}' in ('A4','Letter'), false)
   or not coalesce(p_layout #>> '{page,margin}' in ('narrow','normal','wide'), false)
   or not public.studio_object_keys(p_layout -> 'style', array['corners','rules','density'])
   or not coalesce(p_layout #>> '{style,corners}' in ('sharp','rounded'), false)
   or not coalesce(p_layout #>> '{style,rules}' in ('none','hairline','bold'), false)
   or not coalesce(p_layout #>> '{style,density}' in ('compact','normal','airy'), false)
   or pg_catalog.jsonb_typeof(p_layout -> 'blocks') is distinct from 'array' then return false; end if;
 if pg_catalog.jsonb_array_length(p_layout -> 'blocks') not between 1 and 60 then return false; end if;
 rules := '{"letterhead":{"align":["left","center","split"],"showAddress":"boolean","showContact":"boolean","variant":["plain","band"]},"logo":{"height":[18,34,48,64,88],"align":["left","center","right"]},"cover":{"title":2000,"subtitle":2000,"abstract":2000,"meta":["columns","none"],"tone":["light","dark"]},"quote_meta":{"fields":{"array":["number","revision","date","valid_until","currency"]},"direction":["row","stack"],"labels":"boolean"},"parties":{"layout":["two-col","stacked"],"tint":"boolean"},"intro":{"text":2000},"line_items":{"columns":{"array":["sku","description","spec","qty","unit","rate","tax_code","amount"]},"zebra":"boolean","boxed":"boolean","specs":"boolean"},"totals":{"layout":["right","full"],"showExtras":"boolean"},"extra_charges":{},"payment_schedule":{"layout":["table","cards"],"showNotes":"boolean"},"terms":{"text":2000,"columns":[1,2]},"acceptance":{"text":2000,"showExpiry":"boolean"},"notes":{"text":2000},"spacer":{"height":[6,12,18,24,36,48,72],"rule":"boolean"},"free_text":{"text":2000,"align":["left","center","right"]},"footer":{"text":2000,"right":2000,"rule":"boolean","pageNumbers":["none","x","x_of_y"]}}'::jsonb;
 for b in select value from pg_catalog.jsonb_array_elements(p_layout -> 'blocks') loop
   if not public.studio_object_keys(b, array['id','type','props'])
     or pg_catalog.jsonb_typeof(b -> 'id') is distinct from 'string'
     or not coalesce(b ->> 'id' ~ '^[a-z0-9-]{1,40}$', false)
     or b ->> 'id' = any(seen)
     or pg_catalog.jsonb_typeof(b -> 'type') is distinct from 'string'
     or not (rules ? (b ->> 'type'))
     or pg_catalog.jsonb_typeof(b -> 'props') is distinct from 'object' then return false; end if;
   seen := pg_catalog.array_append(seen, b ->> 'id');
   if b ->> 'type' in ('line_items','totals') then
     if b ->> 'type' = any(singles) then return false; end if;
     singles := pg_catalog.array_append(singles, b ->> 'type');
   end if;
   p := b -> 'props';
   if exists (select 1 from pg_catalog.jsonb_object_keys(p) key where not ((rules -> (b ->> 'type')) ? key)) then return false; end if;
   -- Props are optional; renderer and editor share fixed defaults. Present props must be valid.
   for k, r in select key, value from pg_catalog.jsonb_each(rules -> (b ->> 'type')) loop
     if not (p ? k) then continue; end if;
     if r = '"boolean"'::jsonb then
       if pg_catalog.jsonb_typeof(p -> k) <> 'boolean' then return false; end if;
     elsif pg_catalog.jsonb_typeof(r) = 'number' then
       if pg_catalog.jsonb_typeof(p -> k) <> 'string' or pg_catalog.char_length(p ->> k) > r::text::integer then return false; end if;
     elsif pg_catalog.jsonb_typeof(r) = 'array' then
       if not (r @> pg_catalog.jsonb_build_array(p -> k)) then return false; end if;
     else
       if pg_catalog.jsonb_typeof(p -> k) <> 'array' then return false; end if;
       if pg_catalog.jsonb_array_length(p -> k) not between 1 and pg_catalog.jsonb_array_length(r -> 'array') then return false; end if;
       if (select count(*) <> count(distinct value) from pg_catalog.jsonb_array_elements(p -> k)) then return false; end if;
       for item in select value from pg_catalog.jsonb_array_elements(p -> k) loop
         if not ((r -> 'array') @> pg_catalog.jsonb_build_array(item)) then return false; end if;
       end loop;
     end if;
   end loop;
 end loop;
 return true;
exception when others then return false;
end;
$$;
create function public.studio_system_layout(p_key text) returns jsonb
language sql immutable set search_path = '' as $$
 select case p_key
 when 'classic' then '{"v":1,"page":{"size":"A4","margin":"normal"},"style":{"corners":"sharp","rules":"hairline","density":"normal"},"blocks":[{"id":"b-letterhead","type":"letterhead","props":{"align":"split","showAddress":true,"showContact":true,"variant":"plain"}},{"id":"b-quote-meta","type":"quote_meta","props":{"fields":["number","revision","date","valid_until","currency"],"direction":"row","labels":true}},{"id":"b-intro","type":"intro","props":{"text":"{{quote.title}} \u2014 prepared for {{customer.name}}."}},{"id":"b-parties","type":"parties","props":{"layout":"two-col","tint":false}},{"id":"b-line-items","type":"line_items","props":{"columns":["description","qty","unit","rate","amount"],"zebra":false,"boxed":false,"specs":true}},{"id":"b-totals","type":"totals","props":{"layout":"right","showExtras":true}},{"id":"b-terms","type":"terms","props":{"text":"","columns":1}},{"id":"b-acceptance","type":"acceptance","props":{"text":"Use the secure buyer link to record your decision against {{quote.number}} \u00b7 {{quote.rev}}.","showExpiry":true}},{"id":"b-footer","type":"footer","props":{"text":"{{seller.name}} \u00b7 {{seller.tax_id}}","right":"","rule":true,"pageNumbers":"x_of_y"}}]}'::jsonb
 when 'modern' then '{"v":1,"page":{"size":"A4","margin":"normal"},"style":{"corners":"sharp","rules":"hairline","density":"airy"},"blocks":[{"id":"b-letterhead","type":"letterhead","props":{"align":"split","showAddress":true,"showContact":true,"variant":"plain"}},{"id":"b-intro","type":"intro","props":{"text":"{{quote.title}} \u2014 prepared for {{customer.name}}."}},{"id":"b-quote-meta","type":"quote_meta","props":{"fields":["number","revision","date","valid_until","currency"],"direction":"row","labels":true}},{"id":"b-line-items","type":"line_items","props":{"columns":["description","qty","rate","amount"],"zebra":false,"boxed":false,"specs":false}},{"id":"b-totals","type":"totals","props":{"layout":"right","showExtras":true}},{"id":"b-payment-schedule","type":"payment_schedule","props":{"layout":"table","showNotes":true}},{"id":"b-acceptance","type":"acceptance","props":{"text":"Use the secure buyer link to record your decision against {{quote.number}} \u00b7 {{quote.rev}}.","showExpiry":true}},{"id":"b-footer","type":"footer","props":{"text":"{{seller.name}} \u00b7 {{seller.tax_id}}","right":"","rule":false,"pageNumbers":"x_of_y"}}]}'::jsonb
 when 'industrial' then '{"v":1,"page":{"size":"A4","margin":"normal"},"style":{"corners":"sharp","rules":"bold","density":"normal"},"blocks":[{"id":"b-letterhead","type":"letterhead","props":{"align":"split","showAddress":true,"showContact":true,"variant":"band"}},{"id":"b-quote-meta","type":"quote_meta","props":{"fields":["number","revision","date","valid_until","currency"],"direction":"row","labels":true}},{"id":"b-parties","type":"parties","props":{"layout":"two-col","tint":false}},{"id":"b-line-items","type":"line_items","props":{"columns":["sku","description","qty","unit","rate","amount"],"zebra":true,"boxed":true,"specs":false}},{"id":"b-extra-charges","type":"extra_charges","props":{}},{"id":"b-totals","type":"totals","props":{"layout":"right","showExtras":true}},{"id":"b-terms","type":"terms","props":{"text":"","columns":2}},{"id":"b-acceptance","type":"acceptance","props":{"text":"Use the secure buyer link to record your decision against {{quote.number}} \u00b7 {{quote.rev}}.","showExpiry":true}},{"id":"b-footer","type":"footer","props":{"text":"{{seller.name}} \u00b7 {{seller.tax_id}}","right":"","rule":true,"pageNumbers":"x_of_y"}}]}'::jsonb
 when 'compact' then '{"v":1,"page":{"size":"A4","margin":"narrow"},"style":{"corners":"sharp","rules":"hairline","density":"compact"},"blocks":[{"id":"b-letterhead","type":"letterhead","props":{"align":"split","showAddress":true,"showContact":true,"variant":"plain"}},{"id":"b-quote-meta","type":"quote_meta","props":{"fields":["number","revision","date","valid_until","currency"],"direction":"row","labels":false}},{"id":"b-line-items","type":"line_items","props":{"columns":["description","qty","rate","amount"],"zebra":true,"boxed":false,"specs":false}},{"id":"b-totals","type":"totals","props":{"layout":"right","showExtras":true}},{"id":"b-acceptance","type":"acceptance","props":{"text":"Use the secure buyer link to record your decision against {{quote.number}} \u00b7 {{quote.rev}}.","showExpiry":true}},{"id":"b-terms","type":"terms","props":{"text":"","columns":2}},{"id":"b-footer","type":"footer","props":{"text":"{{seller.name}} \u00b7 {{seller.tax_id}}","right":"","rule":true,"pageNumbers":"x_of_y"}}]}'::jsonb
 when 'exec' then '{"v":1,"page":{"size":"A4","margin":"wide"},"style":{"corners":"sharp","rules":"hairline","density":"airy"},"blocks":[{"id":"b-cover","type":"cover","props":{"title":"{{quote.title}}","subtitle":"Prepared for {{customer.name}} \u00b7 {{customer.contact}}","abstract":"Revision {{quote.rev}} \u00b7 issued {{quote.date}} \u00b7 valid until {{quote.valid_until}}.","meta":"columns","tone":"light"}},{"id":"b-letterhead","type":"letterhead","props":{"align":"split","showAddress":true,"showContact":true,"variant":"plain"}},{"id":"b-intro","type":"intro","props":{"text":"{{quote.title}} \u2014 prepared for {{customer.name}}."}},{"id":"b-line-items","type":"line_items","props":{"columns":["description","qty","unit","amount"],"zebra":false,"boxed":false,"specs":true}},{"id":"b-totals","type":"totals","props":{"layout":"right","showExtras":true}},{"id":"b-payment-schedule","type":"payment_schedule","props":{"layout":"table","showNotes":true}},{"id":"b-acceptance","type":"acceptance","props":{"text":"Use the secure buyer link to record your decision against {{quote.number}} \u00b7 {{quote.rev}}.","showExpiry":true}},{"id":"b-footer","type":"footer","props":{"text":"{{seller.name}} \u00b7 {{seller.tax_id}}","right":"","rule":true,"pageNumbers":"x_of_y"}}]}'::jsonb
 when 'project' then '{"v":1,"page":{"size":"A4","margin":"normal"},"style":{"corners":"sharp","rules":"hairline","density":"normal"},"blocks":[{"id":"b-letterhead","type":"letterhead","props":{"align":"split","showAddress":true,"showContact":true,"variant":"plain"}},{"id":"b-parties","type":"parties","props":{"layout":"two-col","tint":true}},{"id":"b-intro","type":"intro","props":{"text":"{{quote.title}} \u2014 prepared for {{customer.name}}."}},{"id":"b-line-items","type":"line_items","props":{"columns":["description","qty","unit","rate","amount"],"zebra":false,"boxed":false,"specs":true}},{"id":"b-totals","type":"totals","props":{"layout":"right","showExtras":true}},{"id":"b-payment-schedule","type":"payment_schedule","props":{"layout":"cards","showNotes":true}},{"id":"b-terms","type":"terms","props":{"text":"","columns":1}},{"id":"b-acceptance","type":"acceptance","props":{"text":"Use the secure buyer link to record your decision against {{quote.number}} \u00b7 {{quote.rev}}.","showExpiry":true}},{"id":"b-footer","type":"footer","props":{"text":"{{seller.name}} \u00b7 {{seller.tax_id}}","right":"","rule":true,"pageNumbers":"x_of_y"}}]}'::jsonb
 when 'showcase' then '{"v":1,"page":{"size":"A4","margin":"normal"},"style":{"corners":"sharp","rules":"hairline","density":"airy"},"blocks":[{"id":"b-letterhead","type":"letterhead","props":{"align":"split","showAddress":true,"showContact":true,"variant":"plain"}},{"id":"b-quote-meta","type":"quote_meta","props":{"fields":["number","revision","date","valid_until","currency"],"direction":"row","labels":true}},{"id":"b-line-items","type":"line_items","props":{"columns":["sku","description","qty","unit","rate","amount"],"zebra":false,"boxed":false,"specs":true}},{"id":"b-extra-charges","type":"extra_charges","props":{}},{"id":"b-totals","type":"totals","props":{"layout":"right","showExtras":true}},{"id":"b-notes","type":"notes","props":{"text":"Refer to the specifications listed above."}},{"id":"b-acceptance","type":"acceptance","props":{"text":"Use the secure buyer link to record your decision against {{quote.number}} \u00b7 {{quote.rev}}.","showExpiry":true}},{"id":"b-footer","type":"footer","props":{"text":"{{seller.name}} \u00b7 {{seller.tax_id}}","right":"","rule":true,"pageNumbers":"x_of_y"}}]}'::jsonb
 when 'dark' then '{"v":1,"page":{"size":"A4","margin":"normal"},"style":{"corners":"sharp","rules":"bold","density":"normal"},"blocks":[{"id":"b-cover","type":"cover","props":{"title":"{{quote.title}}","subtitle":"Prepared for {{customer.name}} \u00b7 {{customer.contact}}","abstract":"Revision {{quote.rev}} \u00b7 issued {{quote.date}} \u00b7 valid until {{quote.valid_until}}.","meta":"columns","tone":"dark"}},{"id":"b-letterhead","type":"letterhead","props":{"align":"split","showAddress":true,"showContact":true,"variant":"plain"}},{"id":"b-quote-meta","type":"quote_meta","props":{"fields":["number","revision","date","valid_until","currency"],"direction":"row","labels":true}},{"id":"b-line-items","type":"line_items","props":{"columns":["description","qty","unit","rate","amount"],"zebra":false,"boxed":false,"specs":true}},{"id":"b-totals","type":"totals","props":{"layout":"right","showExtras":true}},{"id":"b-payment-schedule","type":"payment_schedule","props":{"layout":"table","showNotes":true}},{"id":"b-acceptance","type":"acceptance","props":{"text":"Use the secure buyer link to record your decision against {{quote.number}} \u00b7 {{quote.rev}}.","showExpiry":true}},{"id":"b-footer","type":"footer","props":{"text":"{{seller.name}} \u00b7 {{seller.tax_id}}","right":"","rule":true,"pageNumbers":"x_of_y"}}]}'::jsonb
 else null end
$$;
revoke all on function public.studio_object_keys(jsonb,text[]), public.studio_layout_is_valid(jsonb), public.studio_system_layout(text) from public, anon, authenticated, service_role;
commit;
