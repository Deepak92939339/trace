import type { OutboxKind } from "./types";

/**
 * Plain-text email wording. Short, no HTML, one link, and nothing internal: no cost, margin,
 * approval reasons or thresholds, no claim about payment, and nothing stronger than "sent".
 * Buyer mail names only what the proposal itself shows (seller, quote number, validity).
 */
export type RenderedEmail = { subject: string; text: string; replyTo?: string };

export type RenderInput = {
  kind: OutboxKind;
  payload: Record<string, unknown>;
  appUrl: string;
  /** Absolute-path part of the buyer link (`/quote/<selector>#secret=…`); buyer mail only. */
  buyerLinkPath?: string;
  /** ISO instant the buyer link stops working; buyer mail only. */
  linkExpiresAt?: string | null;
};

export class TemplateError extends Error {}

/** Strips control characters and collapses whitespace so text can never break a header or line. */
export function plain(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max
    ? `${cleaned.slice(0, max - 1).trimEnd()}…`
    : cleaned;
}

function required(payload: Record<string, unknown>, key: string, max: number) {
  const value = plain(payload[key], max);
  if (!value) throw new TemplateError(`Payload is missing ${key}.`);
  return value;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function formatInstant(value: string | null | undefined, timeZone: string) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime()))
    throw new TemplateError("Link expiry is missing.");
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "long",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date);
  }
}

function subject(value: string) {
  return plain(value, 78);
}

export function renderEmail(input: RenderInput): RenderedEmail {
  const { kind, payload, appUrl } = input;
  const number = required(payload, "quote_number", 40);
  if (kind === "quote_to_buyer") {
    const seller = required(payload, "seller_name", 160);
    const validUntil = required(payload, "valid_until", 10);
    const zone = plain(payload.time_zone, 64) || "UTC";
    if (!input.buyerLinkPath || !input.buyerLinkPath.startsWith("/quote/"))
      throw new TemplateError("Buyer link is missing.");
    const replyTo = plain(payload.reply_to, 254);
    return {
      subject: subject(`Quotation ${number} from ${seller}`),
      text: [
        "Hello,",
        "",
        `${seller} has sent you quotation ${number}.`,
        `It is valid until ${validUntil}.`,
        "",
        "Open this link to review it:",
        `${appUrl}${input.buyerLinkPath}`,
        "",
        `This link is personal to you and stops working on ${formatInstant(input.linkExpiresAt, zone)}.`,
        "If you were not expecting this message, you can ignore it.",
        "",
      ].join("\n"),
      ...(replyTo && EMAIL.test(replyTo) ? { replyTo } : {}),
    };
  }

  const customer = plain(payload.customer_name, 160);
  const revision =
    typeof payload.revision_number === "number"
      ? ` (revision ${payload.revision_number})`
      : "";
  const forCustomer = customer ? ` for ${customer}` : "";
  const quoteUrl = `${appUrl}/quotes/${encodeURIComponent(number)}`;

  if (kind === "approval_waiting") {
    return {
      subject: subject(`Quotation ${number} is waiting for approval`),
      text: [
        `Quotation ${number}${forCustomer}${revision} was submitted and is waiting for approval.`,
        "",
        "Open the approvals queue:",
        `${appUrl}/approvals`,
        "",
      ].join("\n"),
    };
  }

  const verb: Record<string, { subject: string; sentence: string }> = {
    buyer_accepted: {
      subject: "buyer accepted",
      sentence: "The buyer accepted",
    },
    buyer_declined: {
      subject: "buyer declined",
      sentence: "The buyer declined",
    },
    buyer_change_requested: {
      subject: "buyer asked for changes",
      sentence: "The buyer asked for changes to",
    },
  };
  const wording = verb[kind];
  if (!wording) throw new TemplateError("Unknown email kind.");
  const message = plain(payload.buyer_message, 500);
  const lines = [
    `${wording.sentence} quotation ${number}${forCustomer}${revision}.`,
    "",
  ];
  if (message) lines.push("Buyer message:", message, "");
  lines.push("Open the quotation:", quoteUrl, "");
  return {
    subject: subject(`Quotation ${number}: ${wording.subject}`),
    text: lines.join("\n"),
  };
}

/** Words that must never appear in any email this system sends (checked by a unit test). */
export const FORBIDDEN_WORDING =
  /\b(cost|costs|margin|margins|below|threshold|reason|reasons|paid|payment|payments|received|settled|overdue|outstanding|delivered|delivery)\b/i;
