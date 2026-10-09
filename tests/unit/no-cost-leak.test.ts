import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalizeQuoteSnapshotV1 } from "../../lib/quotes/canonical-snapshot";
import { recipientQuoteViewModel } from "../../lib/public-quotes/view-model";
import type { BuyerQuoteProjection } from "../../lib/quotes/commitment-contracts";
import { canonicalV1Vectors } from "../fixtures/canonical-v1-vectors";

const LEAK = /cost|margin/i;

function projection(index: number): BuyerQuoteProjection {
  return {
    linkId: "10000000-0000-4000-8000-000000000001",
    revisionId: "20000000-0000-4000-8000-000000000001",
    quoteNumber: "TND-2026-0001",
    revisionNumber: 1,
    effectiveState: "issued",
    snapshotHash: "a".repeat(64),
    calculationFingerprint: "b".repeat(64),
    snapshot: canonicalV1Vectors[index]!.snapshot,
    responseType: null,
    acceptanceAllowed: true,
    acceptanceStatementVersion: 1,
    acceptanceStatement: "I accept this exact Tender quotation revision.",
  };
}

// Every key and every string value, anywhere in a JSON value.
function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value))
    value.forEach((entry) => allStrings(entry, out));
  else if (value && typeof value === "object")
    for (const [key, entry] of Object.entries(value)) {
      out.push(key);
      allStrings(entry, out);
    }
  return out;
}

describe("internal cost and margin never reach buyer-facing output", () => {
  it.each(canonicalV1Vectors.map((_, index) => index))(
    "sealed snapshot vector %i has no key or value matching /cost|margin/i",
    (index) => {
      const snapshot = canonicalV1Vectors[index]!.snapshot;
      expect(allStrings(snapshot).filter((text) => LEAK.test(text))).toEqual(
        [],
      );
      expect(canonicalizeQuoteSnapshotV1(snapshot)).not.toMatch(LEAK);
    },
  );

  it.each(canonicalV1Vectors.map((_, index) => index))(
    "buyer view model %i (the proposal and its print projection) has no cost or margin",
    (index) => {
      const view = recipientQuoteViewModel(projection(index));
      expect(allStrings(view).filter((text) => LEAK.test(text))).toEqual([]);
      expect(JSON.stringify(view)).not.toContain("approval_reason_codes");
    },
  );

  it("the canonical snapshot schema rejects cost or margin keys, or drops them from the bytes", () => {
    const base = canonicalV1Vectors[0]!.snapshot;
    const rejected = [
      { ...base, margin_bps: 1 },
      { ...base, totals: { ...base.totals, margin_bps: 1 } },
      {
        ...base,
        approval_policy: { ...base.approval_policy, unit_cost_minor: 1 },
      },
    ];
    for (const value of rejected) {
      expect(() => canonicalizeQuoteSnapshotV1(value)).toThrow();
    }
    // Line items are copied key by key, so an injected key never reaches the bytes.
    const injected = {
      ...base,
      items: base.items.map((item) => ({ ...item, unit_cost_minor: 1 })),
    };
    expect(canonicalizeQuoteSnapshotV1(injected)).not.toMatch(LEAK);
  });

  it("the sealed approval reason codes in fixtures never include margin codes", () => {
    for (const vector of canonicalV1Vectors) {
      expect(vector.snapshot.approval_policy.reason_codes).not.toContain(
        "below_cost",
      );
      expect(vector.snapshot.approval_policy.reason_codes).not.toContain(
        "margin_under_floor",
      );
    }
  });

  it("buyer-facing and print sources reference no cost or margin identifiers", () => {
    const files = [
      "lib/quotes/canonical-snapshot.ts",
      "lib/public-quotes/view-model.ts",
      "lib/public-quotes/edge-client.ts",
      "lib/public-quotes/transport.ts",
      "components/quotes/issued-print-document.tsx",
      "components/proposal/proposal-view.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /unit_cost|cost_minor|margin_bps|marginBps|margin_floor|below_cost|margin_under_floor/,
      );
    }
  });
});
