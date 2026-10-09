import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPublicSupabaseEnv } from "@/lib/supabase/public-env";
import { QUOTE_PDF_BUCKET, QUOTE_PDF_MAX_BYTES } from "./path";
import type { ClaimResult, RegisteredPdf, StoreOutcome } from "./ensure-pdf";

/**
 * The only module that may read the service-role credential (scripts/verify-secrets.mjs fails
 * the build checks if any other file under app/, components/ or lib/ names it, or if anything
 * outside lib/quote-pdf/ and route handlers imports this file).
 *
 * It exists because a private, tamper-proof file cannot be written by any browser role: the
 * trusted server writes the bytes and registers them through record_quote_pdf, which only
 * service_role can execute. Reads and URL signing use the signed-in user's own session.
 */
export class PrivilegedWriterUnavailableError extends Error {
  constructor() {
    super("The server credential for writing PDFs is not configured.");
    this.name = "PrivilegedWriterUnavailableError";
  }
}

let client: SupabaseClient<Database> | undefined;

export function privilegedWriterConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function privileged(): SupabaseClient<Database> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new PrivilegedWriterUnavailableError();
  client ??= createClient<Database>(getPublicSupabaseEnv().url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Unexpected database response shape.");
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string) {
  if (typeof value !== "string" || value === "")
    throw new Error(`Database response is missing ${label}.`);
  return value;
}

function seconds(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.ceil(value))
    : 30;
}

export async function claimRender(
  userId: string,
  revisionId: string,
): Promise<ClaimResult> {
  const { data, error } = await privileged().rpc("claim_quote_pdf_render", {
    p_user_id: userId,
    p_revision_id: revisionId,
  });
  if (error) throw new Error(`claim_quote_pdf_render failed: ${error.code}`);
  const result = record(data);
  switch (result.status) {
    case "render":
      return {
        status: "render",
        attemptId: text(result.attempt_id, "attempt"),
      };
    case "exists":
    case "in_progress":
    case "revision_not_renderable":
      return { status: result.status };
    case "cooldown":
    case "rate_limited":
      return {
        status: result.status,
        retryAfterSeconds: seconds(result.retry_after_seconds),
      };
    default:
      throw new Error("claim_quote_pdf_render returned an unknown status.");
  }
}

export async function finishRender(attemptId: string, succeeded: boolean) {
  const { error } = await privileged().rpc("finish_quote_pdf_render", {
    p_attempt_id: attemptId,
    p_succeeded: succeeded,
  });
  if (error) throw new Error(`finish_quote_pdf_render failed: ${error.code}`);
}

/** The stored object's bytes, or null when nothing is stored at the path. */
export async function readObject(path: string): Promise<Uint8Array | null> {
  const storage = privileged().storage.from(QUOTE_PDF_BUCKET);
  // exists() answers { data: false, error } for a missing object (HTTP 400/404) and throws for
  // anything else, so "no data" is the only not-found signal.
  const present = await storage.exists(path);
  if (!present.data) return null;
  const { data, error } = await storage.download(path);
  if (error || !data) throw new Error("Storage download failed.");
  return new Uint8Array(await data.arrayBuffer());
}

/** Writes the bytes without ever replacing an existing object. */
export async function storeObject(
  path: string,
  bytes: Uint8Array,
): Promise<StoreOutcome> {
  if (bytes.byteLength < 1 || bytes.byteLength > QUOTE_PDF_MAX_BYTES)
    throw new RangeError("PDF size is outside the allowed range.");
  const { error } = await privileged()
    .storage.from(QUOTE_PDF_BUCKET)
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
      cacheControl: "31536000",
    });
  if (!error) return "stored";
  const status = (error as { statusCode?: string }).statusCode;
  if (status === "409" || /already exists|duplicate/i.test(error.message))
    return "exists";
  throw new Error("Storage upload failed.");
}

export async function registerPdf(input: {
  revisionId: string;
  sha256: string;
  byteLength: number;
  path: string;
}): Promise<RegisteredPdf> {
  const { data, error } = await privileged().rpc("record_quote_pdf", {
    p_revision_id: input.revisionId,
    p_sha256: input.sha256,
    p_byte_length: input.byteLength,
    p_path: input.path,
  });
  if (error) throw new Error(`record_quote_pdf failed: ${error.code}`);
  const row = record(data);
  return {
    revisionId: text(row.revision_id, "revision_id"),
    storagePath: text(row.storage_path, "storage_path"),
    sha256: text(row.sha256, "sha256"),
    byteLength: Number(row.byte_length),
    snapshotHash: text(row.snapshot_hash, "snapshot_hash"),
    generatedAt: text(row.generated_at, "generated_at"),
  };
}
