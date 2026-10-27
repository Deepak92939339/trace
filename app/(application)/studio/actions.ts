"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { brandIsValid, parseLayout } from "@/lib/studio/layout-schema";
import { validateAsset } from "@/lib/studio/assets";
import {
  studioContext,
  studioRpc,
  templateRow,
  uuid,
} from "@/lib/studio/server";
import { StudioError, studioFailure } from "@/lib/studio/errors";
import type { Json } from "@/lib/supabase/database.types";
import { loadIssuedDocument } from "@/lib/studio/issued-document";
import { printDataFromIssued, type PrintData } from "@/lib/studio/print-data";
import type { TemplateRow } from "@/lib/studio/server";

type Result<T = void> =
  { ok: true; value: T } | { ok: false; code: string; message: string };
async function mutation<T>(
  capability: string,
  run: () => Promise<T>,
): Promise<Result<T>> {
  try {
    await studioContext(capability);
    const value = await run();
    revalidatePath("/studio");
    return { ok: true, value };
  } catch (error) {
    const e = studioFailure(error);
    return { ok: false, code: e.code, message: e.message };
  }
}
function name(value: unknown) {
  if (
    typeof value !== "string" ||
    [...value.trim()].length < 1 ||
    [...value.trim()].length > 80
  )
    throw new StudioError("studio_template_invalid");
  return value.trim();
}
export async function createTemplateAction(input: {
  name: string;
  baseKey: string;
  layout: unknown;
}): Promise<Result<TemplateRow>> {
  return mutation("template.manage", async () =>
    templateRow(
      await studioRpc("create_document_template", {
        p_name: name(input.name),
        p_base_key: input.baseKey,
        p_layout: parseLayout(input.layout) as unknown as Json,
      }),
    ),
  );
}
export async function duplicateTemplateAction(input: {
  source: string;
  name: string;
}): Promise<Result<TemplateRow>> {
  return mutation("template.manage", async () => {
    if (typeof input.source !== "string" || input.source.length > 80)
      throw new StudioError("studio_template_invalid");
    return templateRow(
      await studioRpc("duplicate_document_template", {
        p_id_or_base_key: input.source,
        p_name: name(input.name),
      }),
    );
  });
}
export async function saveTemplateAction(input: {
  id: string;
  expectedVersion: number;
  layout: unknown;
}): Promise<Result<TemplateRow>> {
  return mutation("template.manage", async () => {
    if (
      !Number.isSafeInteger(input.expectedVersion) ||
      input.expectedVersion < 1
    )
      throw new StudioError("studio_template_invalid");
    return templateRow(
      await studioRpc("save_document_template", {
        p_id: uuid(input.id),
        p_expected_version: input.expectedVersion,
        p_layout: parseLayout(input.layout) as unknown as Json,
      }),
    );
  });
}
export async function archiveTemplateAction(id: string): Promise<Result> {
  return mutation("template.manage", async () => {
    await studioRpc("archive_document_template", { p_id: uuid(id) });
  });
}
export async function setDefaultTemplateAction(id: string): Promise<Result> {
  return mutation("template.manage", async () => {
    await studioRpc("set_default_document_template", { p_id: uuid(id) });
  });
}
export async function saveBrandAction(brand: unknown): Promise<Result> {
  return mutation("brand.manage", async () => {
    if (!brandIsValid(brand)) throw new StudioError("studio_brand_invalid");
    await studioRpc("save_organization_brand", {
      p_brand: brand as unknown as Json,
    });
  });
}
export async function uploadLogoAction(
  form: FormData,
): Promise<Result<{ id: string }>> {
  return mutation("brand.manage", async () => {
    const file = form.get("logo");
    if (
      !(file instanceof File) ||
      file.size > (file.type === "image/svg+xml" ? 131072 : 524288)
    )
      throw new StudioError("studio_asset_invalid");
    const safe = validateAsset(
      file.type,
      new Uint8Array(await file.arrayBuffer()),
    );
    const data = await studioRpc("create_document_asset", {
      p_mime: safe.mime,
      p_bytes: "\\x" + Buffer.from(safe.bytes).toString("hex"),
      p_sha256: createHash("sha256").update(safe.bytes).digest("hex"),
    });
    const row = Array.isArray(data) ? (data[0] as unknown) : data;
    if (!row || typeof row !== "object" || !("id" in row))
      throw new StudioError("studio_data_invalid");
    return { id: uuid(row.id) };
  });
}
export async function deleteLogoAction(id: string): Promise<Result> {
  return mutation("brand.manage", async () => {
    await studioRpc("delete_document_asset", { p_id: uuid(id) });
  });
}
export async function workspaceExportAction(): Promise<
  Result<{ href: string }>
> {
  // Actual export records/throttles its request in GET; this action only gives an authorized link.
  return mutation("workspace.export", async () => {
    await studioContext("organization.manage");
    return { href: "/api/studio/workspace" };
  });
}

export async function previewQuotationAction(params: {
  number: string;
  revisionNumber: string;
}): Promise<Result<PrintData>> {
  try {
    const doc = await loadIssuedDocument(params, "preview");
    return { ok: true, value: printDataFromIssued(doc.props) };
  } catch (error) {
    const e = studioFailure(error);
    return { ok: false, code: e.code, message: e.message };
  }
}
