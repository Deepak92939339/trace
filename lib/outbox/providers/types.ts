import type { OutboxErrorCode } from "../types";

/**
 * A message to hand to a provider. There is deliberately no idempotency key: a retry after a
 * crash mints a new buyer link, so a provider that de-duplicated the retry would deliver nothing
 * while the first link had already been revoked (see the P6 report, "crash window").
 */
export type MailMessage = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
};

export type MailReceipt = { providerMessageId: string };

export class MailError extends Error {
  constructor(
    readonly code: OutboxErrorCode,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "MailError";
  }
}

export interface MailProvider {
  readonly name: string;
  send(message: MailMessage): Promise<MailReceipt>;
}
