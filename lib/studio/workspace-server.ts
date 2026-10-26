import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createHash } from "node:crypto";
import {
  QUOTE_PDF_BUCKET,
  QUOTE_PDF_MAX_BYTES,
  quotePdfFilename,
} from "@/lib/quote-pdf/path";
import {
  getBrand,
  isRecord,
  listTemplates,
  readAsset,
  studioContext,
  studioRpc,
} from "./server.ts";
import { issuedHtmlReadOnly } from "./issued-document.ts";
import {
  collectRevisionFiles,
  workspaceReadme,
  type ExportRevision,
} from "./workspace-export.ts";
import { StudioError } from "./errors.ts";
import {
  csv,
  storedZip,
  WORKSPACE_MAX_BYTES,
  WORKSPACE_MAX_REVISIONS,
  type ZipEntry,
} from "./zip.ts";

const QUOTE_FIELDS = [
  "id",
  "number",
  "state",
  "currency_code",
  "issue_date",
  "valid_until",
  "total_minor",
] as const;
const CUSTOMER_FIELDS = [
  "id",
  "name",
  "contact_name",
  "email",
  "phone",
  "billing_address_line1",
  "billing_address_line2",
  "billing_city",
  "billing_region",
  "billing_postal_code",
  "billing_country_code",
  "tax_identifier",
  "locale",
  "preferred_currency_code",
  "active",
] as const;
const CATALOG_FIELDS = [
  "id",
  "sku",
  "description",
  "unit_code",
  "unit_price_minor",
  "currency_code",
  "active",
] as const;
type PageResult = { data: unknown; error: unknown };
/** Keyset pages (rather than trusting the Data API's default row limit). */
async function collect(
  read: (after: string | null) => PromiseLike<PageResult>,
  budget: { bytes: number },
) {
  const rows: Record<string, unknown>[] = [];
  let after: string | null = null;
  for (;;) {
    const result = await read(after);
    if (result.error || !Array.isArray(result.data))
      throw new StudioError("studio_unavailable", 503);
    for (const row of result.data) {
      if (
        !isRecord(row) ||
        typeof row.id !== "string" ||
        (after !== null && row.id <= after)
      )
        throw new StudioError("studio_data_invalid");
      budget.bytes += new TextEncoder().encode(JSON.stringify(row)).length;
      if (budget.bytes > WORKSPACE_MAX_BYTES)
        throw new StudioError("studio_export_too_large", 413);
      rows.push(row);
      after = row.id;
    }
    if (result.data.length < 500) return rows;
  }
}
/** Copies the already registered PDF from storage after the same digest/anchor checks as a download. Never renders. */
async function registeredPdfFor(
  client: Awaited<ReturnType<typeof createClient>>,
  revision: ExportRevision,
  snapshotHash: string | null,
) {
  const { data: row, error } = await client
    .from("quote_revision_pdfs")
    .select("storage_path,sha256,byte_length,snapshot_hash")
    .eq("revision_id", revision.id)
    .maybeSingle();
  if (error) throw new StudioError("studio_unavailable", 503);
  if (!row) return null;
  const { data, error: downloadError } = await client.storage
    .from(QUOTE_PDF_BUCKET)
    .download(row.storage_path);
  if (downloadError || !data) throw new StudioError("studio_unavailable", 503);
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (
    !snapshotHash ||
    row.snapshot_hash !== snapshotHash ||
    bytes.length !== row.byte_length ||
    bytes.length > QUOTE_PDF_MAX_BYTES ||
    createHash("sha256").update(bytes).digest("hex") !== row.sha256 ||
    Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-"
  )
    throw new StudioError("studio_data_invalid");
  return {
    filename: quotePdfFilename(revision.number, revision.revisionNumber),
    bytes,
  };
}
export async function workspaceResponse(request: Request): Promise<Response> {
  const context = await studioContext("workspace.export");
  for (const capability of [
    "organization.manage",
    "quote.print",
    "quote.read",
    "catalog.read",
    "customer.read",
    "template.read",
  ])
    await studioContext(capability);
  const origin = request.headers.get("Origin");
  if (
    request.headers.get("Sec-Fetch-Site") === "cross-site" ||
    (origin && origin !== new URL(request.url).origin)
  )
    throw new StudioError("studio_forbidden", 403);
  // Atomic database throttle and activity event apply even if an oversized/failed export aborts.
  await studioRpc("request_workspace_export");
  const client = await createClient(),
    org = context.membership.organization;
  const revisionResult = await client
    .from("quote_revisions")
    .select("id,quote_id,revision_number,snapshot_hash")
    .eq("organization_id", org.id)
    .eq("state", "issued")
    .not("snapshot_hash", "is", null)
    .order("id")
    .limit(WORKSPACE_MAX_REVISIONS + 1);
  if (revisionResult.error) throw new StudioError("studio_unavailable", 503);
  if ((revisionResult.data?.length ?? 0) > WORKSPACE_MAX_REVISIONS)
    throw new StudioError("studio_export_too_large", 413);
  const entries: ZipEntry[] = [];
  let used = 22;
  const add = (name: string, content: string | Uint8Array) => {
    const bytes =
      typeof content === "string" ? new TextEncoder().encode(content) : content;
    used += 76 + 2 * new TextEncoder().encode(name).length + bytes.length;
    if (used > WORKSPACE_MAX_BYTES)
      throw new StudioError("studio_export_too_large", 413);
    entries.push({ name, bytes });
  };
  const budget = { bytes: 0 };
  const quotes = await collect((after) => {
    let q = client
      .from("quotes")
      .select(QUOTE_FIELDS.join(","))
      .eq("organization_id", org.id)
      .order("id")
      .limit(500);
    if (after) q = q.gt("id", after);
    return q;
  }, budget);
  const customers = await collect((after) => {
    let q = client
      .from("customers")
      .select(CUSTOMER_FIELDS.join(","))
      .eq("organization_id", org.id)
      .order("id")
      .limit(500);
    if (after) q = q.gt("id", after);
    return q;
  }, budget);
  const catalog = await collect((after) => {
    let q = client
      .from("products")
      .select(CATALOG_FIELDS.join(","))
      .eq("organization_id", org.id)
      .order("id")
      .limit(500);
    if (after) q = q.gt("id", after);
    return q;
  }, budget);
  add(
    "data/quotes.csv",
    csv([QUOTE_FIELDS, ...quotes.map((r) => QUOTE_FIELDS.map((k) => r[k]))]),
  );
  add(
    "data/customers.csv",
    csv([
      CUSTOMER_FIELDS,
      ...customers.map((r) => CUSTOMER_FIELDS.map((k) => r[k])),
    ]),
  );
  add(
    "data/catalog.csv",
    csv([
      CATALOG_FIELDS,
      ...catalog.map((r) => CATALOG_FIELDS.map((k) => r[k])),
    ]),
  );
  const templates = await listTemplates(),
    brand = await getBrand();
  add("studio/templates.json", JSON.stringify(templates, null, 2));
  add("studio/brand.json", JSON.stringify(brand, null, 2));
  if (brand.logo_asset_id) {
    const logo = await readAsset(brand.logo_asset_id),
      ext = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/svg+xml": "svg",
      }[logo.mime];
    add(`studio/logo.${ext}`, logo.bytes);
  }
  const byId = new Map(quotes.map((q) => [q.id, q]));
  const revisions: ExportRevision[] = (revisionResult.data ?? []).map(
    (revision) => {
      const quote = byId.get(revision.quote_id);
      if (!quote || typeof quote.number !== "string")
        throw new StudioError("studio_data_invalid");
      return {
        id: revision.id,
        number: quote.number,
        revisionNumber: revision.revision_number,
      };
    },
  );
  const snapshotHashes = new Map(
    (revisionResult.data ?? []).map((r) => [r.id, r.snapshot_hash]),
  );
  const { files, missingPdf } = await collectRevisionFiles(revisions, {
    html: (revision) =>
      issuedHtmlReadOnly({
        number: revision.number,
        revisionNumber: String(revision.revisionNumber),
      }),
    registeredPdf: (revision) =>
      registeredPdfFor(
        client,
        revision,
        snapshotHashes.get(revision.id) ?? null,
      ),
  });
  for (const file of files) add(file.name, file.content);
  add(
    "README.txt",
    workspaceReadme({
      organization: org.name,
      generatedAt: new Date().toISOString(),
      missingPdf,
    }),
  );
  const zip = storedZip(entries);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(zip);
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="trace-workspace.zip"',
      "Content-Length": String(zip.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
