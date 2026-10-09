import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_WORDING,
  plain,
  renderEmail,
  TemplateError,
} from "../../lib/outbox/templates";
import { OUTBOX_KINDS, type OutboxKind } from "../../lib/outbox/types";

const APP = "https://app.example.test";
const LINK = "/quote/0f8fad5b-d9cb-469f-a165-70867728950e#secret=abc";

const payloads: Record<OutboxKind, Record<string, unknown>> = {
  quote_to_buyer: {
    quote_number: "TND-2026-0001",
    seller_name: "Tender Demonstration Company",
    valid_until: "2026-11-06",
    time_zone: "Asia/Kolkata",
    reply_to: "sales@tender.local",
  },
  buyer_accepted: {
    quote_number: "TND-2026-0001",
    customer_name: "Asha Engineering Works",
    revision_number: 2,
  },
  buyer_declined: {
    quote_number: "TND-2026-0001",
    customer_name: "Asha Engineering Works",
    revision_number: 1,
  },
  buyer_change_requested: {
    quote_number: "TND-2026-0001",
    customer_name: "Asha Engineering Works",
    revision_number: 1,
    buyer_message: "Please move the start to March.",
  },
  approval_waiting: {
    quote_number: "TND-2026-0001",
    customer_name: "Asha Engineering Works",
    revision_number: 1,
  },
};

function render(kind: OutboxKind, payload = payloads[kind]) {
  return renderEmail({
    kind,
    payload,
    appUrl: APP,
    buyerLinkPath: kind === "quote_to_buyer" ? LINK : undefined,
    linkExpiresAt: "2026-10-20T10:00:00.000Z",
  });
}

describe("email wording", () => {
  it.each(OUTBOX_KINDS)(
    "%s: short, plain, one link, nothing forbidden",
    (kind) => {
      const email = render(kind);
      const all = `${email.subject}\n${email.text}`;
      expect(all).not.toMatch(FORBIDDEN_WORDING);
      expect(all).not.toMatch(/[<>]/);
      expect(email.subject.length).toBeLessThanOrEqual(78);
      expect(email.subject).not.toMatch(/[\r\n]/);
      expect(email.text.length).toBeLessThan(900);
      const links = email.text.match(/https?:\/\/\S+/g) ?? [];
      expect(links).toHaveLength(1);
      expect(email.text.endsWith("\n")).toBe(true);
    },
  );

  it("buyer mail: seller, number, validity, the share link, its expiry and Reply-To; nothing internal", () => {
    const email = render("quote_to_buyer");
    expect(email.subject).toBe(
      "Quotation TND-2026-0001 from Tender Demonstration Company",
    );
    expect(email.text).toContain(
      "Tender Demonstration Company has sent you quotation TND-2026-0001.",
    );
    expect(email.text).toContain("valid until 2026-11-06");
    expect(email.text).toContain(`${APP}${LINK}`);
    expect(email.text).toContain("20 October 2026");
    expect(email.replyTo).toBe("sales@tender.local");
    for (const internal of [
      "Asha",
      "revision",
      "approval",
      "operator",
      "manager",
    ])
      expect(email.text.toLowerCase()).not.toContain(internal.toLowerCase());
  });

  it("buyer mail links only to the existing buyer share route", () => {
    const url = new URL(
      render("quote_to_buyer").text.match(/https?:\/\/\S+/)![0],
    );
    expect(url.origin).toBe(APP);
    expect(url.pathname).toMatch(/^\/quote\/[0-9a-f-]{36}$/);
    expect(url.hash).toMatch(/^#secret=/);
    expect(url.search).toBe("");
  });

  it("claims nothing stronger than sent: no delivery or payment wording anywhere", () => {
    for (const kind of OUTBOX_KINDS) {
      const { subject, text } = render(kind);
      expect(`${subject} ${text}`).not.toMatch(
        /\b(delivered|delivery|paid|payment|received|settled|overdue|read by)\b/i,
      );
    }
  });

  it("Reply-To is only used when it is a plain address", () => {
    for (const bad of [
      "not an address",
      "a@b",
      "x@y.z\nBcc: evil@example.test",
      "",
    ])
      expect(
        render("quote_to_buyer", { ...payloads.quote_to_buyer, reply_to: bad })
          .replyTo,
      ).toBeUndefined();
    const omitted = { ...payloads.quote_to_buyer };
    delete omitted.reply_to;
    expect(render("quote_to_buyer", omitted).replyTo).toBeUndefined();
  });

  it("internal mail points at the app, not at the buyer route", () => {
    expect(render("buyer_accepted").text).toContain(
      `${APP}/quotes/TND-2026-0001`,
    );
    expect(render("approval_waiting").text).toContain(`${APP}/approvals`);
    expect(render("buyer_accepted").text).not.toContain("/quote/0f8");
  });

  it("buyer message: plain text, control characters stripped, at most 500 characters", () => {
    const hostile = `Hi\u0000\u0007\r\nBcc: attacker@example.test ${"x".repeat(900)}`;
    const email = render("buyer_change_requested", {
      ...payloads.buyer_change_requested,
      buyer_message: hostile,
    });
    const message = email.text.split("Buyer message:\n")[1]!.split("\n\n")[0]!;
    expect(message.length).toBeLessThanOrEqual(500);
    expect(message).not.toMatch(
      new RegExp("[\\u0000-\\u001f\\u007f\\u2028\\u2029]"),
    );
    expect(email.subject).not.toContain("attacker");
    expect(
      email.text.split("\n").filter((line) => line.startsWith("Bcc:")),
    ).toEqual([]);
  });

  it("acceptance and decline carry no buyer message section", () => {
    for (const kind of ["buyer_accepted", "buyer_declined"] as const)
      expect(render(kind).text).not.toContain("Buyer message:");
  });

  it("sanitises every payload field and truncates long ones", () => {
    const email = render("buyer_accepted", {
      quote_number: "TND-1\r\nX: y",
      customer_name: `Cust${"o".repeat(300)}`,
      revision_number: 1,
    });
    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.text).toContain("…");
  });

  it("fails loudly on a payload that cannot be rendered", () => {
    expect(() => render("buyer_accepted", {})).toThrow(TemplateError);
    expect(() =>
      renderEmail({
        kind: "quote_to_buyer",
        payload: payloads.quote_to_buyer,
        appUrl: APP,
      }),
    ).toThrow(TemplateError);
    expect(() =>
      renderEmail({
        kind: "quote_to_buyer",
        payload: payloads.quote_to_buyer,
        appUrl: APP,
        buyerLinkPath: "/elsewhere",
        linkExpiresAt: "2026-10-20T10:00:00.000Z",
      }),
    ).toThrow(TemplateError);
    expect(() =>
      renderEmail({
        kind: "quote_to_buyer",
        payload: payloads.quote_to_buyer,
        appUrl: APP,
        buyerLinkPath: LINK,
        linkExpiresAt: null,
      }),
    ).toThrow(TemplateError);
  });

  it("plain() strips controls and collapses whitespace", () => {
    expect(plain("a\u0000b\n\n  c\t", 20)).toBe("a b c");
    expect(plain(42, 20)).toBe("");
    expect(plain("abcdef", 4)).toBe("abc…");
  });

  it("the forbidden-wording pattern really catches the words it names", () => {
    for (const word of [
      "cost",
      "margin",
      "below",
      "threshold",
      "reason",
      "paid",
      "payment received",
      "settled",
      "overdue",
      "outstanding",
      "delivered",
    ])
      expect(word).toMatch(FORBIDDEN_WORDING);
  });
});
