import type { OutboxKind } from "./types";

/** Labels for the Emails list. "Sent" means handed to the mail server, never "delivered". */
export type EmailActivityRow = {
  id: string;
  kind: string;
  audience: string;
  recipient_label: string;
  display_status: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  sent_at: string | null;
  last_error_code: string | null;
};

export const KIND_LABEL: Record<OutboxKind, string> = {
  quote_to_buyer: "Quotation to buyer",
  buyer_accepted: "Buyer accepted",
  buyer_declined: "Buyer declined",
  buyer_change_requested: "Buyer asked for changes",
  approval_waiting: "Waiting for approval",
};

const ERROR_LABEL: Record<string, string> = {
  provider_rejected: "The mail service refused the message.",
  provider_unavailable: "The mail service was not reachable.",
  rate_limited: "The mail service asked us to slow down.",
  invalid_recipient: "The address was not accepted.",
  configuration: "Email sending is not configured correctly.",
  timeout: "The mail service did not answer in time.",
  internal_error: "An internal error stopped the message.",
  template_invalid: "The message could not be prepared.",
  link_unavailable: "The quotation changed before the email could be sent.",
  lease_expired: "The sender stopped before finishing.",
};

export function emailKindLabel(kind: string) {
  return KIND_LABEL[kind as OutboxKind] ?? "Email";
}

export function emailStatusLabel(row: EmailActivityRow) {
  switch (row.display_status) {
    case "sent":
      return "Sent";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Not sent (quotation changed)";
    default:
      return row.attempts > 0
        ? `Queued, retrying (attempt ${Math.min(row.attempts + 1, row.max_attempts)} of ${row.max_attempts})`
        : "Queued";
  }
}

export function emailErrorLabel(code: string | null) {
  return code ? (ERROR_LABEL[code] ?? "The message could not be sent.") : null;
}
