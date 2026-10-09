import { recipientCapabilityUrl } from "../quotes/share-link";
import { renderEmail, TemplateError } from "./templates";
import type {
  ClaimedEmail,
  CompleteInput,
  DrainSummary,
  MintResult,
  OutboxErrorCode,
} from "./types";
import { MailError, type MailProvider } from "./providers/types";

/**
 * One drain pass over the outbox. Pure orchestration over injected dependencies so that the
 * state machine is tested without a database, a mail server or a clock.
 *
 * Delivery is at-least-once. The crash window: a buyer email first mints a share link, then
 * sends. If the process dies after the provider accepted the message but before `complete`
 * recorded it, the row is reclaimed after its lease, a new link is minted and the first link is
 * revoked. The recipient then holds two emails, and only the second link works. No provider
 * idempotency key is sent on purpose: de-duplicating that retry would deliver nothing while the
 * first link was already revoked.
 */
export type DrainDeps = {
  claim(limit: number, leaseSeconds: number): Promise<ClaimedEmail[]>;
  mintLink(id: string, attemptNo: number): Promise<MintResult>;
  complete(input: CompleteInput): Promise<void>;
  provider: MailProvider;
  from: string;
  appUrl: string;
  now(): number;
};

export type DrainOptions = {
  batchSize?: number;
  leaseSeconds?: number;
  budgetMs?: number;
};

export async function drainOutbox(
  deps: DrainDeps,
  options: DrainOptions = {},
): Promise<DrainSummary> {
  const batchSize = options.batchSize ?? 5;
  const leaseSeconds = options.leaseSeconds ?? 120;
  const budgetMs = options.budgetMs ?? 40_000;
  const started = deps.now();
  const summary: DrainSummary = {
    claimed: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    cancelled: 0,
  };
  while (deps.now() - started < budgetMs) {
    const batch = await deps.claim(batchSize, leaseSeconds);
    if (batch.length === 0) break;
    summary.claimed += batch.length;
    for (const email of batch) {
      const outcome = await deliver(deps, email);
      if (outcome === "sent") summary.sent += 1;
      else if (outcome === "retry") summary.retried += 1;
      else if (outcome === "dead") summary.dead += 1;
      else if (outcome === "cancelled") summary.cancelled += 1;
    }
  }
  return summary;
}

type Outcome = "sent" | "retry" | "dead" | "cancelled" | "ignored";

async function deliver(deps: DrainDeps, email: ClaimedEmail): Promise<Outcome> {
  const finish = async (
    outcome: Exclude<Outcome, "ignored">,
    errorCode: OutboxErrorCode | null,
    providerMessageId: string | null = null,
  ): Promise<Outcome> => {
    await deps.complete({
      id: email.id,
      attemptNo: email.attemptNo,
      outcome,
      errorCode,
      providerMessageId,
    });
    return outcome;
  };
  try {
    let buyerLinkPath: string | undefined;
    if (email.kind === "quote_to_buyer") {
      const minted = await deps.mintLink(email.id, email.attemptNo);
      if (minted.status === "ignored") return "ignored";
      if (minted.status === "cancelled")
        return finish("cancelled", minted.code);
      buyerLinkPath = recipientCapabilityUrl(minted.selector, minted.secret);
    }
    let rendered;
    try {
      rendered = renderEmail({
        kind: email.kind,
        payload: email.payload,
        appUrl: deps.appUrl,
        buyerLinkPath,
        linkExpiresAt: email.shareExpiresAt,
      });
    } catch (error) {
      if (error instanceof TemplateError)
        return finish("dead", "template_invalid");
      throw error;
    }
    const receipt = await deps.provider.send({
      from: deps.from,
      to: email.recipientEmail,
      subject: rendered.subject,
      text: rendered.text,
      ...(rendered.replyTo ? { replyTo: rendered.replyTo } : {}),
    });
    return finish("sent", null, receipt.providerMessageId);
  } catch (error) {
    if (error instanceof MailError)
      return finish(error.retryable ? "retry" : "dead", error.code);
    console.error("outbox_delivery_failed", {
      id: email.id,
      name: error instanceof Error ? error.name : "unknown",
    });
    return finish("retry", "internal_error");
  }
}
