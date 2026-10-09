import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getPublicSupabaseEnv } from "@/lib/supabase/public-env";
import {
  OUTBOX_ERROR_CODES,
  OUTBOX_KINDS,
  type ClaimedEmail,
  type CompleteInput,
  type MintResult,
  type OutboxErrorCode,
  type OutboxKind,
} from "./types";

/**
 * The outbox worker's database access: three fixed service_role routines (claim, mint link,
 * complete). One of the two modules that may read the service-role credential (the other is the
 * PDF writer); scripts/service-role-confinement.mjs enforces that no other file names it and
 * that only lib/outbox/** and route handlers import this module.
 */
export class OutboxUnavailableError extends Error {
  constructor() {
    super("The server credential for the email outbox is not configured.");
    this.name = "OutboxUnavailableError";
  }
}

let client: SupabaseClient<Database> | undefined;

export function outboxCredentialConfigured() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function privileged(): SupabaseClient<Database> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new OutboxUnavailableError();
  client ??= createClient<Database>(getPublicSupabaseEnv().url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export async function claimEmails(
  limit: number,
  leaseSeconds: number,
): Promise<ClaimedEmail[]> {
  const { data, error } = await privileged().rpc("claim_email_outbox", {
    p_limit: limit,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(`claim_email_outbox failed: ${error.code}`);
  if (!Array.isArray(data)) throw new Error("claim_email_outbox gave no list");
  return data.map((row) => {
    if (!isRecord(row)) throw new Error("claim_email_outbox gave a bad row");
    const kind = row.kind as OutboxKind;
    if (
      typeof row.id !== "string" ||
      !OUTBOX_KINDS.includes(kind) ||
      typeof row.recipient_email !== "string" ||
      !isRecord(row.payload) ||
      typeof row.attempt_no !== "number"
    )
      throw new Error("claim_email_outbox gave a malformed row");
    return {
      id: row.id,
      kind,
      audience: row.audience === "buyer" ? "buyer" : "internal",
      recipientEmail: row.recipient_email,
      payload: row.payload,
      shareExpiresAt:
        typeof row.share_expires_at === "string" ? row.share_expires_at : null,
      attemptNo: row.attempt_no,
      organizationId: String(row.organization_id),
      quoteId: String(row.quote_id),
      revisionId: String(row.revision_id),
    };
  });
}

export async function mintBuyerLink(
  id: string,
  attemptNo: number,
): Promise<MintResult> {
  const { data, error } = await privileged().rpc("outbox_mint_share_link", {
    p_outbox_id: id,
    p_attempt_no: attemptNo,
  });
  if (error) throw new Error(`outbox_mint_share_link failed: ${error.code}`);
  if (!isRecord(data)) throw new Error("outbox_mint_share_link gave no result");
  if (data.status === "minted") {
    if (
      typeof data.selector !== "string" ||
      typeof data.secret !== "string" ||
      typeof data.expires_at !== "string"
    )
      throw new Error("outbox_mint_share_link gave a malformed link");
    return {
      status: "minted",
      selector: data.selector,
      secret: data.secret,
      expiresAt: data.expires_at,
    };
  }
  if (data.status === "cancelled") {
    const code = data.code as OutboxErrorCode;
    return {
      status: "cancelled",
      code: OUTBOX_ERROR_CODES.includes(code) ? code : "link_unavailable",
    };
  }
  return { status: "ignored" };
}

export async function completeEmail(input: CompleteInput): Promise<void> {
  const { error } = await privileged().rpc("complete_email_outbox", {
    p_outbox_id: input.id,
    p_attempt_no: input.attemptNo,
    p_outcome: input.outcome,
    // The routine takes NULL for "none"; the generated argument types are not nullable.
    p_provider_message_id: (input.providerMessageId ??
      null) as unknown as string,
    p_error_code: (input.errorCode ?? null) as unknown as string,
  });
  if (error) throw new Error(`complete_email_outbox failed: ${error.code}`);
}
