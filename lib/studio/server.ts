import "server-only";
import { createHash } from "node:crypto";
import { getApplicationContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { brandIsValid, parseLayout, type Brand, type Layout } from "./layout-schema.ts";
import { assetDataUrl, validateAsset } from "./assets.ts";
import { StudioError, studioFailure } from "./errors.ts";
import { systemTemplate, type SystemTemplateKey } from "./templates/index.ts";

export const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export function uuid(value: unknown): string { if (typeof value !== "string" || !UUID.test(value)) throw new StudioError("studio_data_invalid"); return value; }
export async function studioContext(capability: string) {
  const context = await getApplicationContext();
  if (!context) throw new StudioError("studio_authentication_required",401);
  if (!context.membership || !context.capabilities.includes(capability)) throw new StudioError("studio_forbidden",403);
  return { ...context, membership: context.membership };
}
type StudioRpc = "list_document_templates" | "get_document_template" | "create_document_template" | "save_document_template" | "duplicate_document_template" | "archive_document_template" | "set_default_document_template" | "get_organization_brand" | "save_organization_brand" | "create_document_asset" | "delete_document_asset" | "read_document_asset" | "pin_revision_layout" | "get_revision_layout" | "list_studio_activity" | "request_workspace_export";
/** The sole temporary type boundary until local `db:types` can be regenerated. All return data is parsed. */
export async function studioRpc(name: StudioRpc, args: Record<string, Json> = {}): Promise<unknown> {
  const client = await createClient();
  const { data, error } = await client.rpc(name as never,args as never);
  if (error) throw studioFailure(error);
  return data as unknown;
}
export function single(value: unknown): unknown {
  if (Array.isArray(value)) { if (value.length > 1) throw new StudioError("studio_data_invalid"); return value[0] ?? null; }
  return value;
}
export type TemplateRow = { id: string; organization_id: string; name: string; base_template_key: SystemTemplateKey; layout: Layout; version: number; is_default: boolean; archived_at: string | null };
export function templateRow(value: unknown): TemplateRow {
  const row = single(value);
  if (!isRecord(row) || typeof row.name !== "string" || [...row.name].length < 1 || [...row.name].length > 80 || typeof row.version !== "number" || !Number.isSafeInteger(row.version) || row.version < 1 || typeof row.is_default !== "boolean" || typeof row.base_template_key !== "string" || !systemTemplate(row.base_template_key) || !(row.archived_at === null || typeof row.archived_at === "string")) throw new StudioError("studio_data_invalid");
  return { id: uuid(row.id),organization_id: uuid(row.organization_id),name:row.name,base_template_key:row.base_template_key as SystemTemplateKey,layout:parseLayout(row.layout),version:row.version,is_default:row.is_default,archived_at:row.archived_at };
}
export async function listTemplates() {
  const context = await studioContext("template.read"), result = await studioRpc("list_document_templates");
  if (!Array.isArray(result) || result.length > 25) throw new StudioError("studio_data_invalid");
  const rows = result.map(templateRow);
  if (rows.some(r => r.organization_id !== context.membership.organizationId)) throw new StudioError("studio_data_invalid");
  return rows;
}
export async function getTemplate(id: string) {
  const context = await studioContext("template.read"), row = templateRow(await studioRpc("get_document_template",{p_id:uuid(id)}));
  if (row.organization_id !== context.membership.organizationId) throw new StudioError("studio_data_invalid");
  return row;
}
export async function getBrand(): Promise<Brand> {
  await studioContext("template.read"); const value = single(await studioRpc("get_organization_brand"));
  if (!brandIsValid(value)) throw new StudioError("studio_data_invalid"); return value;
}
export async function readAsset(id: string) {
  await studioContext("template.read"); const value = single(await studioRpc("read_document_asset",{p_id:uuid(id)}));
  if (!isRecord(value) || value.id !== id || typeof value.mime !== "string" || typeof value.base64 !== "string" || value.base64.length > 700000 || typeof value.sha256 !== "string" || typeof value.byte_length !== "number") throw new StudioError("studio_data_invalid");
  const bytes = new Uint8Array(Buffer.from(value.base64,"base64"));
  if (bytes.length !== value.byte_length || createHash("sha256").update(bytes).digest("hex") !== value.sha256) throw new StudioError("studio_data_invalid");
  // No unsafe asset bytes escape this function; read-time sanitizer also catches direct RPC uploads.
  const safe = validateAsset(value.mime,bytes);
  return { ...safe, id, dataUrl: assetDataUrl(safe.mime,safe.bytes) };
}
export type PinnedDocument = { layout: Layout; brand: Brand; logo: { mime: string; bytes: Uint8Array } | null; layoutHash: string };
export async function pinRevisionLayout(revisionId: string): Promise<PinnedDocument | null> {
  const context = await studioContext("quote.print");
  return parseRevisionLayout(await studioRpc("pin_revision_layout",{p_revision_id:uuid(revisionId)}),revisionId,context.membership.organizationId);
}
/** Read-only: never pins or logs; absent rows retain the existing legacy rendering. */
export async function readRevisionLayout(revisionId: string): Promise<PinnedDocument | null> {
  const context = await studioContext("quote.read");
  await studioContext("template.read");
  return parseRevisionLayout(await studioRpc("get_revision_layout",{p_revision_id:uuid(revisionId)}),revisionId,context.membership.organizationId);
}
async function parseRevisionLayout(value: unknown, revisionId: string, organizationId: string): Promise<PinnedDocument | null> {
  const raw = single(value);
  if (raw === null || isRecord(raw) && raw.revision_id === null) return null;
  // Invalid layouts always use the unchanged legacy renderer, with a server-side warning.
  let layout: Layout, brand: Brand;
  try {
    if (!isRecord(raw) || raw.revision_id !== revisionId || raw.organization_id !== organizationId || typeof raw.layout_hash !== "string" || !/^[0-9a-f]{64}$/.test(raw.layout_hash) || !brandIsValid(raw.brand)) throw new StudioError("studio_data_invalid");
    layout = parseLayout(raw.layout); brand = raw.brand;
  } catch {
    console.warn("studio_pinned_layout_invalid",{revisionId}); return null;
  }
  let logo: PinnedDocument["logo"] = null;
  if (brand.logo_asset_id) {
    try { logo = await readAsset(brand.logo_asset_id); } catch (error) {
      const code = studioFailure(error).code;
      if (!["studio_asset_svg_invalid","studio_asset_magic_invalid","studio_asset_invalid"].includes(code)) throw error;
      console.warn("studio_logo_rejected",{revisionId,code});
    }
  }
  return { layout,brand,logo,layoutHash:(raw as Record<string,unknown>).layout_hash as string };
}

export type ActivityRow = { id: string; action: string; subject_type: string; created_at: string };
export async function listActivity(limit = 50): Promise<ActivityRow[]> {
  const context = await studioContext("template.read");
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new StudioError("studio_data_invalid");
  const data = await studioRpc("list_studio_activity",{p_limit:limit});
  if (!Array.isArray(data) || data.length > limit) throw new StudioError("studio_data_invalid");
  return data.map(row => { if (!isRecord(row) || row.organization_id !== context.membership.organizationId || typeof row.action !== "string" || typeof row.subject_type !== "string" || typeof row.created_at !== "string") throw new StudioError("studio_data_invalid"); return {id:uuid(row.id),action:row.action,subject_type:row.subject_type,created_at:row.created_at}; });
}
