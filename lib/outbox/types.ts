/** Shared shapes for the email outbox worker. */
export const OUTBOX_KINDS = [
  "quote_to_buyer",
  "buyer_accepted",
  "buyer_declined",
  "buyer_change_requested",
  "approval_waiting",
] as const;
export type OutboxKind = (typeof OUTBOX_KINDS)[number];

/** Closed list of error codes the database accepts (lower-case letters and underscores). */
export const OUTBOX_ERROR_CODES = [
  "provider_rejected",
  "provider_unavailable",
  "rate_limited",
  "invalid_recipient",
  "configuration",
  "timeout",
  "internal_error",
  "template_invalid",
  "link_unavailable",
] as const;
export type OutboxErrorCode = (typeof OUTBOX_ERROR_CODES)[number];

export type ClaimedEmail = {
  id: string;
  kind: OutboxKind;
  audience: "buyer" | "internal";
  recipientEmail: string;
  payload: Record<string, unknown>;
  shareExpiresAt: string | null;
  attemptNo: number;
  organizationId: string;
  quoteId: string;
  revisionId: string;
};

export type MintResult =
  | { status: "minted"; selector: string; secret: string; expiresAt: string }
  | { status: "cancelled"; code: OutboxErrorCode }
  | { status: "ignored" };

export type CompleteInput = {
  id: string;
  attemptNo: number;
  outcome: "sent" | "retry" | "dead" | "cancelled";
  providerMessageId?: string | null;
  errorCode?: OutboxErrorCode | null;
};

export type DrainSummary = {
  claimed: number;
  sent: number;
  retried: number;
  dead: number;
  cancelled: number;
};

/** An environment-like object (so tests can pass one without touching process.env). */
export type MailEnv = Readonly<Record<string, string | undefined>>;
