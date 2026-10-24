// WRITTEN, NOT EXECUTED. Requires a freshly reset, confirmed disposable local database.
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ORGANIZATION_ID, provisionIssuedQuote, psql, REVIEWER, sha256, signIn } from "./p5-support";

test.describe.configure({mode:"serial"});
const id=randomUUID(), email=`studio-${id}@trace.local`, password="StudioLocal1!", marker=`Studio ${id.slice(0,8)}`;
// p5-support verifies CLI loopback URL and exact Docker identity before any SQL.
// Audit-linked local fixtures remain until the next local reset; do not try to delete pinned rows.
test.beforeAll(()=>{
 psql(`begin;
 insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
 values('00000000-0000-0000-0000-000000000000','${id}','authenticated','authenticated','${email}',extensions.crypt('${password}',extensions.gen_salt('bf')),now(),'','','','','{"provider":"email","providers":["email"]}','{"display_name":"Studio Local Admin"}',now(),now());
 insert into auth.identities(provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
 values('${id}','${id}',jsonb_build_object('sub','${id}','email','${email}','email_verified',true),'email',now(),now(),now());
 insert into public.organization_memberships(organization_id,user_id,role_id,status)
 select '${ORGANIZATION_ID}','${id}',r.id,'active' from public.roles r where r.key='organization_admin';
 commit;`);
});

test("author, upload, save, pin, download and reprint the exact old layout",async({page})=>{
 await page.setViewportSize({width:1440,height:1000}); await signIn(page,{email,password}); await page.goto("/studio");
 await page.getByLabel("Name for your copy").fill(marker);
 await page.locator("article").filter({has:page.getByRole("heading",{name:"Classic Formal",exact:true})}).getByRole("button",{name:"Duplicate to edit"}).click();
 await expect(page.getByRole("tab",{name:"Editor",exact:true})).toHaveAttribute("aria-selected","true");
 await page.getByRole("button",{name:"free text",exact:true}).click();
 await page.getByLabel("text",{exact:true}).fill(marker);
 await page.getByRole("button",{name:"Save layout",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Template saved"})).toBeVisible();
 await page.getByRole("tab",{name:"Templates",exact:true}).click();
 await page.locator("article").filter({has:page.getByRole("heading",{name:marker,exact:true})}).getByRole("button",{name:"Set default"}).click();
 await expect(page.getByRole("status").filter({hasText:"Default template set"})).toBeVisible();
 await page.getByRole("tab",{name:"Brand",exact:true}).click();
 await page.getByLabel(/Logo · PNG/).setInputFiles({name:"studio.svg",mimeType:"image/svg+xml",buffer:Buffer.from('<svg viewBox="0 0 16 16"><path fill="#216b46" d="M0 0h16v16H0z"/></svg>')});
 await expect(page.getByRole("status").filter({hasText:"Logo uploaded"})).toBeVisible();
 await page.getByRole("button",{name:"Save brand",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Brand saved"})).toBeVisible();
 const quote=provisionIssuedQuote({notes:"Studio sealed fixture",lines:3,schedule:true});
 await page.goto(`/quotes/${encodeURIComponent(quote.number)}`);
 await expect(page.locator(".studio-document")).toHaveCount(1);
 const path=`/api/studio/quotes/${encodeURIComponent(quote.number)}/revisions/${quote.revisionNumber}/html`;
 const first=await page.request.get(path); expect(first.status()).toBe(200);expect(first.headers()["content-disposition"]).toContain("attachment");
 const html=await first.text(); expect(html).toContain(marker);expect(html).not.toMatch(/<script|(?:src|href)="https?:/i);expect(html).toContain("data:image/svg+xml;base64,");
 const pdfPath=`/quotes/${encodeURIComponent(quote.number)}/revisions/${quote.revisionNumber}/pdf`;
 const pdf=await page.request.get(pdfPath);expect(pdf.status()).toBe(200);expect(pdf.headers()["content-disposition"]).toContain("attachment");const firstPdf=await pdf.body();expect(firstPdf.subarray(0,5).toString()).toBe("%PDF-");
 const pinned=psql(`select layout_hash from public.quote_revision_layouts where revision_id='${quote.revisionId}'`);expect(pinned).toMatch(/^[0-9a-f]{64}$/);
 await page.goto("/studio");await page.getByRole("tab",{name:"Templates",exact:true}).click();
 await page.locator("article").filter({has:page.getByRole("heading",{name:new RegExp(marker)})}).getByRole("button",{name:"Open",exact:true}).click();
 // Select the last free-text block in the block list (the palette also has its add button).
 await page.getByRole("button",{name:"free text",exact:true}).first().click();
 await page.getByLabel("text",{exact:true}).fill("Changed after first print");await page.getByRole("button",{name:"Save layout",exact:true}).click();await expect(page.getByRole("status").filter({hasText:"Template saved"})).toBeVisible();
 expect(await (await page.request.get(path)).text()).toBe(html);
 expect(sha256(new Uint8Array(await (await page.request.get(pdfPath)).body()))).toBe(sha256(new Uint8Array(firstPdf)));
 expect(psql(`select layout_hash from public.quote_revision_layouts where revision_id='${quote.revisionId}'`)).toBe(pinned);
 await page.getByRole("button",{name:"Open profile menu"}).click();
 await expect(page.getByRole("menu",{name:"Profile"}).getByRole("menuitem",{name:"Export workspace"})).toBeVisible();
 await page.keyboard.press("Escape");await expect(page.getByRole("button",{name:"Open profile menu"})).toBeFocused();
});

test("reviewer has a read-only Studio and cannot export a workspace",async({page})=>{
 await signIn(page,REVIEWER);await page.goto("/studio");await expect(page.getByRole("heading",{name:"Document Studio",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Duplicate to edit"})).toHaveCount(0);
 await page.getByRole("tab",{name:"Brand",exact:true}).click();await expect(page.getByRole("button",{name:"Save brand"})).toHaveCount(0);await expect(page.locator('input[type="file"]')).toHaveCount(0);
 const exportResponse=await page.request.get("/api/studio/workspace");expect(exportResponse.status()).toBe(403);
 await page.getByRole("button",{name:"Open profile menu"}).click();await expect(page.getByRole("menuitem",{name:"Export workspace"})).toHaveCount(0);
});
