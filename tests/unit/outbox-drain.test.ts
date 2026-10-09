import { describe, expect, it, vi } from "vitest";
import { drainOutbox, type DrainDeps } from "../../lib/outbox/drain";
import { MailError, type MailMessage } from "../../lib/outbox/providers/types";
import type {
  ClaimedEmail,
  CompleteInput,
  MintResult,
} from "../../lib/outbox/types";

const SELECTOR = "0f8fad5b-d9cb-4469-a165-70867728950e";
const SECRET = "A".repeat(43);

function email(overrides: Partial<ClaimedEmail> = {}): ClaimedEmail {
  return {
    id: "e1",
    kind: "buyer_accepted",
    audience: "internal",
    recipientEmail: "ops@example.test",
    payload: {
      quote_number: "TND-1",
      customer_name: "Asha",
      revision_number: 1,
    },
    shareExpiresAt: null,
    attemptNo: 1,
    organizationId: "o",
    quoteId: "q",
    revisionId: "r",
    ...overrides,
  };
}

function buyerEmail(overrides: Partial<ClaimedEmail> = {}) {
  return email({
    id: "b1",
    kind: "quote_to_buyer",
    audience: "buyer",
    recipientEmail: "buyer@example.test",
    payload: {
      quote_number: "TND-1",
      seller_name: "Seller Ltd",
      valid_until: "2026-12-01",
      time_zone: "UTC",
    },
    shareExpiresAt: "2026-11-01T10:00:00.000Z",
    ...overrides,
  });
}

function world(
  queue: ClaimedEmail[],
  options: {
    send?: (message: MailMessage) => Promise<{ providerMessageId: string }>;
    mint?: () => Promise<MintResult>;
  } = {},
) {
  const completions: CompleteInput[] = [];
  const sent: MailMessage[] = [];
  const pending = [...queue];
  let clock = 0;
  const deps: DrainDeps = {
    claim: async (limit) => pending.splice(0, limit),
    mintLink:
      options.mint ??
      (async () => ({
        status: "minted",
        selector: SELECTOR,
        secret: SECRET,
        expiresAt: "2026-11-01T10:00:00.000Z",
      })),
    complete: async (input) => {
      completions.push(input);
    },
    provider: {
      name: "fake",
      send: async (message) => {
        sent.push(message);
        return options.send
          ? options.send(message)
          : { providerMessageId: `msg-${sent.length}` };
      },
    },
    from: "Trace <quotes@example.test>",
    appUrl: "https://app.example.test",
    now: () => (clock += 1),
  };
  return { deps, completions, sent };
}

describe("drainOutbox", () => {
  it("sends an internal email and records the provider message id", async () => {
    const { deps, completions, sent } = world([email()]);
    const summary = await drainOutbox(deps);
    expect(summary).toEqual({
      claimed: 1,
      sent: 1,
      retried: 0,
      dead: 0,
      cancelled: 0,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("ops@example.test");
    expect(sent[0]!.from).toBe("Trace <quotes@example.test>");
    expect(completions).toEqual([
      {
        id: "e1",
        attemptNo: 1,
        outcome: "sent",
        errorCode: null,
        providerMessageId: "msg-1",
      },
    ]);
  });

  it("buyer mail: mints the link at delivery, puts it in the body, sends no idempotency key", async () => {
    const mint = vi.fn(async () => ({
      status: "minted" as const,
      selector: SELECTOR,
      secret: SECRET,
      expiresAt: "2026-11-01T10:00:00.000Z",
    }));
    const { deps, sent } = world([buyerEmail({ attemptNo: 2 })], { mint });
    await drainOutbox(deps);
    expect(mint).toHaveBeenCalledWith("b1", 2);
    expect(sent[0]!.text).toContain(
      `https://app.example.test/quote/${SELECTOR}#secret=${SECRET}`,
    );
    expect(Object.keys(sent[0]!).sort()).toEqual([
      "from",
      "subject",
      "text",
      "to",
    ]);
  });

  it("the link secret is never part of a completion record", async () => {
    const { deps, completions } = world([buyerEmail()]);
    await drainOutbox(deps);
    expect(JSON.stringify(completions)).not.toContain(SECRET);
  });

  it("a retryable provider failure is retried with a short error code", async () => {
    const { deps, completions } = world([email()], {
      send: async () => {
        throw new MailError(
          "provider_unavailable",
          true,
          "SMTP ECONNREFUSED 127.0.0.1",
        );
      },
    });
    const summary = await drainOutbox(deps);
    expect(summary.retried).toBe(1);
    expect(completions[0]).toMatchObject({
      outcome: "retry",
      errorCode: "provider_unavailable",
    });
    expect(JSON.stringify(completions)).not.toContain("127.0.0.1");
  });

  it("a permanent provider failure dead-letters at once", async () => {
    const { deps, completions } = world([email()], {
      send: async () => {
        throw new MailError("invalid_recipient", false, "550");
      },
    });
    expect((await drainOutbox(deps)).dead).toBe(1);
    expect(completions[0]).toMatchObject({
      outcome: "dead",
      errorCode: "invalid_recipient",
    });
  });

  it("an unexpected error becomes a retryable internal_error without leaking its message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { deps, completions } = world([email()], {
      send: async () => {
        throw new Error("secret detail ops@example.test");
      },
    });
    await drainOutbox(deps);
    expect(completions[0]).toMatchObject({
      outcome: "retry",
      errorCode: "internal_error",
    });
    expect(JSON.stringify(completions)).not.toContain("secret detail");
  });

  it("a quotation that changed before delivery is cancelled and nothing is sent", async () => {
    const { deps, completions, sent } = world([buyerEmail()], {
      mint: async () => ({ status: "cancelled", code: "link_unavailable" }),
    });
    const summary = await drainOutbox(deps);
    expect(summary.cancelled).toBe(1);
    expect(sent).toHaveLength(0);
    expect(completions[0]).toMatchObject({
      outcome: "cancelled",
      errorCode: "link_unavailable",
    });
  });

  it("an ignored mint (the lease was lost) sends and records nothing", async () => {
    const { deps, completions, sent } = world([buyerEmail()], {
      mint: async () => ({ status: "ignored" }),
    });
    await drainOutbox(deps);
    expect(sent).toHaveLength(0);
    expect(completions).toHaveLength(0);
  });

  it("an unrenderable payload dead-letters instead of retrying forever", async () => {
    const { deps, completions, sent } = world([email({ payload: {} })]);
    await drainOutbox(deps);
    expect(sent).toHaveLength(0);
    expect(completions[0]).toMatchObject({
      outcome: "dead",
      errorCode: "template_invalid",
    });
  });

  it("drains in batches until the queue is empty, one send per email", async () => {
    const queue = Array.from({ length: 12 }, (_, index) =>
      email({ id: `e${index}` }),
    );
    const { deps, sent, completions } = world(queue);
    const summary = await drainOutbox(deps, { batchSize: 5 });
    expect(summary.claimed).toBe(12);
    expect(summary.sent).toBe(12);
    expect(sent).toHaveLength(12);
    expect(new Set(completions.map((entry) => entry.id)).size).toBe(12);
  });

  it("a replayed drain with nothing due sends nothing", async () => {
    const { deps, sent } = world([]);
    expect(await drainOutbox(deps)).toEqual({
      claimed: 0,
      sent: 0,
      retried: 0,
      dead: 0,
      cancelled: 0,
    });
    expect(sent).toHaveLength(0);
  });

  it("stops claiming when the time budget is spent", async () => {
    const queue = Array.from({ length: 30 }, (_, index) =>
      email({ id: `e${index}` }),
    );
    const { deps } = world(queue);
    let clock = 0;
    deps.now = () => (clock += 20_000);
    const summary = await drainOutbox(deps, { batchSize: 5, budgetMs: 40_000 });
    expect(summary.claimed).toBeLessThan(30);
  });

  it("two concurrent drains never send the same email twice when the claim is exclusive", async () => {
    const queue = Array.from({ length: 6 }, (_, index) =>
      email({ id: `e${index}` }),
    );
    const shared = [...queue];
    const sent: string[] = [];
    const make = (): DrainDeps => ({
      ...world([]).deps,
      claim: async (limit) => shared.splice(0, limit),
      provider: {
        name: "fake",
        send: async (message) => {
          sent.push(message.to + message.subject);
          return { providerMessageId: "x" };
        },
      },
    });
    await Promise.all([
      drainOutbox(make(), { batchSize: 2 }),
      drainOutbox(make(), { batchSize: 2 }),
    ]);
    expect(sent).toHaveLength(6);
  });
});
