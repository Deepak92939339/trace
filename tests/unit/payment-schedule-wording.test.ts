import { describe, expect, it } from "vitest";
import { recipientQuoteViewModel } from "../../lib/public-quotes/view-model";
import type { BuyerQuoteProjection } from "../../lib/quotes/commitment-contracts";
import { canonicalV1Vectors } from "../fixtures/canonical-v1-vectors";
import { canonicalV2Vectors } from "../fixtures/canonical-v2-vectors";

// Nothing may say or imply a payment was made, received or is pending in a system.
const STATUS_WORDING =
  /\b(paid|payment(s)? (made|received|pending)|received|pending|outstanding|overdue|settled|receipt|invoice(d)?|balance due|remitted|cleared)\b/i;

function projection(
  snapshot: BuyerQuoteProjection["snapshot"],
): BuyerQuoteProjection {
  return {
    linkId: "10000000-0000-4000-8000-000000000001",
    revisionId: "20000000-0000-4000-8000-000000000001",
    quoteNumber: "TND-2026-0001",
    revisionNumber: 1,
    effectiveState: "issued",
    snapshotHash: "a".repeat(64),
    calculationFingerprint: "b".repeat(64),
    snapshot,
    responseType: null,
    acceptanceAllowed: true,
    acceptanceStatementVersion: 1,
    acceptanceStatement: "I accept this exact Tender quotation revision.",
  };
}

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((entry) => strings(entry, out));
  else if (value && typeof value === "object")
    for (const [key, entry] of Object.entries(value)) {
      out.push(key);
      strings(entry, out);
    }
  return out;
}

describe("buyer projection that contains a payment schedule", () => {
  it.each(canonicalV2Vectors.map((vector, index) => [vector.name, index]))(
    "%s: no string or key anywhere implies a payment status",
    (_name, index) => {
      const view = recipientQuoteViewModel(
        projection(canonicalV2Vectors[index]!.snapshot),
      );
      expect(view.paymentSchedule.length).toBeGreaterThan(0);
      expect(strings(view).filter((text) => STATUS_WORDING.test(text))).toEqual(
        [],
      );
    },
  );

  it("describes when payment is due, from the sealed amounts", () => {
    const view = recipientQuoteViewModel(
      projection(canonicalV2Vectors[0]!.snapshot),
    );
    expect(view.paymentSchedule.map((row) => row.dueText)).toEqual([
      "Due on acceptance",
      "Due on delivery",
      "Due on 2027-03-31",
    ]);
    expect(view.paymentSchedule.map((row) => row.percentDisplay)).toEqual([
      "50.00%",
      "30.00%",
      "20.00%",
    ]);
  });

  it("has an empty schedule for a v1 snapshot", () => {
    for (const vector of canonicalV1Vectors) {
      expect(
        recipientQuoteViewModel(projection(vector.snapshot)).paymentSchedule,
      ).toEqual([]);
    }
  });

  it("the guard itself catches status wording", () => {
    for (const bad of [
      "Paid",
      "Payment received",
      "Pending",
      "Balance due",
      "Overdue",
    ])
      expect(STATUS_WORDING.test(bad)).toBe(true);
    for (const good of ["Due on acceptance", "Deposit", "Final instalment"])
      expect(STATUS_WORDING.test(good)).toBe(false);
  });
});
