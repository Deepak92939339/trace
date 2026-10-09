import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssuedPrintDocument } from "../../components/quotes/issued-print-document";
import {
  canonicalizeQuoteSnapshot,
  canonicalUtf8,
  type CanonicalQuoteSnapshot,
} from "../../lib/quotes/canonical-snapshot";
import {
  issuedActorForRevision,
  printPropsFromLegacyRows,
  printPropsFromRevision,
  SealedSnapshotError,
  verifiedSealedSnapshot,
  type IssuedPrintProps,
  type LegacyPrintRows,
} from "../../lib/quotes/issued-print-props";
import { canonicalV1Vectors } from "../fixtures/canonical-v1-vectors";
import { canonicalV2Vectors } from "../fixtures/canonical-v2-vectors";

const ISSUED_AT = "2026-08-14T09:30:00.000Z";
const ZONE = "Asia/Kolkata";

function html(props: IssuedPrintProps) {
  return renderToStaticMarkup(createElement(IssuedPrintDocument, props));
}

function sha256(snapshot: CanonicalQuoteSnapshot) {
  return createHash("sha256")
    .update(canonicalUtf8(canonicalizeQuoteSnapshot(snapshot)))
    .digest("hex");
}

/** What the live quote tables hold for a snapshot, the way the page used to read them. */
function liveRowsFor(snapshot: CanonicalQuoteSnapshot): LegacyPrintRows {
  const { seller, buyer, commercial, totals } = snapshot;
  return {
    quote: {
      number: snapshot.quote.number,
      issue_date: commercial.issue_date,
      valid_until: commercial.valid_until,
      currency_code: commercial.currency_code,
      locale: commercial.locale,
      tax_label: commercial.tax_label,
      tax_mode: commercial.tax_mode,
      notes: commercial.notes,
      subtotal_minor: totals.subtotal_minor,
      discount_minor: totals.discount_minor,
      tax_minor: totals.tax_minor,
      charges_minor: totals.charges_minor,
      charge_net_minor: totals.charge_net_minor,
      total_minor: totals.total_minor,
      issued_at: ISSUED_AT,
      customer_name_snapshot: buyer.name,
      contact_name_snapshot: buyer.contact_name,
      email_snapshot: buyer.email,
      billing_address_line1_snapshot: buyer.address_line1,
      billing_address_line2_snapshot: buyer.address_line2,
      billing_city_snapshot: buyer.city,
      billing_region_snapshot: buyer.region,
      billing_postal_code_snapshot: buyer.postal_code,
      billing_country_code_snapshot: buyer.country_code,
      tax_identifier_snapshot: buyer.tax_identifier,
    },
    seller: {
      legalName: seller.legal_name,
      addressLine1: seller.address_line1,
      addressLine2: seller.address_line2 || null,
      city: seller.city,
      region: seller.region || null,
      postalCode: seller.postal_code || null,
      countryCode: seller.country_code,
      taxIdentifier: seller.tax_identifier,
      contactEmail: seller.contact_email,
      contactPhone: seller.contact_phone,
    },
    items: [...snapshot.items]
      .sort((left, right) => left.position - right.position)
      .map((item) => ({
        id: item.id,
        position: item.position,
        sku_snapshot: item.sku,
        description_snapshot: item.description,
        unit_code_snapshot: item.unit_code,
        quantity_scaled: item.quantity_scaled,
        quantity_scale: item.quantity_scale,
        unit_price_minor_snapshot: item.unit_price_minor,
        tax_code_snapshot: item.tax_code,
      })),
    charges: [...snapshot.charges]
      .sort((left, right) => left.position - right.position)
      .map((charge) => ({
        id: charge.id,
        description_snapshot: charge.description,
        amount_minor: charge.amount_minor,
        tax_minor: charge.tax_minor,
        charge_total_minor: charge.total_minor,
      })),
    issuedActor: "Aarav Operator",
    timeZone: ZONE,
  };
}

describe("one source of print content", () => {
  it.each(canonicalV1Vectors.map((vector, index) => [vector.name, index]))(
    "snapshot adapter renders exactly what the quote tables rendered: %s",
    (_name, index) => {
      const snapshot = canonicalV1Vectors[index as number]!.snapshot;
      const fromSnapshot = printPropsFromRevision({
        snapshot,
        issuedAt: ISSUED_AT,
        issuedActor: "Aarav Operator",
        timeZone: ZONE,
      });
      const fromTables = printPropsFromLegacyRows(liveRowsFor(snapshot));
      expect(html(fromSnapshot)).toBe(html(fromTables));
    },
  );

  it("renders a v2 snapshot's sealed payment schedule", () => {
    const vector = canonicalV2Vectors[0]!;
    const props = printPropsFromRevision({
      snapshot: vector.snapshot,
      issuedAt: ISSUED_AT,
      issuedActor: "Aarav Operator",
      timeZone: ZONE,
    });
    const markup = html(props);
    expect(markup).toContain("Payment schedule");
    for (const entry of vector.snapshot.payment_schedule) {
      expect(markup).toContain(entry.label);
    }
    expect(markup).toContain("50.00%");
    expect(markup).toContain("Due on acceptance");
    expect(markup).toContain("Due on 2027-03-31");
    expect(props.paymentSchedule).toHaveLength(3);
  });

  it("renders no schedule section for a v1 snapshot", () => {
    const props = printPropsFromRevision({
      snapshot: canonicalV1Vectors[0]!.snapshot,
      issuedAt: ISSUED_AT,
      issuedActor: "Aarav Operator",
      timeZone: ZONE,
    });
    expect(props.paymentSchedule).toEqual([]);
    expect(html(props)).not.toContain("Payment schedule");
  });

  it("prints lines in position order even if the snapshot array is not sorted", () => {
    const snapshot = canonicalV1Vectors[3]!.snapshot;
    expect(snapshot.items.map((item) => item.position)).toEqual([2, 1]);
    const props = printPropsFromRevision({
      snapshot,
      issuedAt: ISSUED_AT,
      issuedActor: "x",
      timeZone: ZONE,
    });
    expect(props.items.map((item) => item.position)).toEqual([1, 2]);
  });

  it("shows the issue time in the organization's zone, not the server's", () => {
    const base = {
      snapshot: canonicalV1Vectors[0]!.snapshot,
      issuedAt: "2026-08-14T22:30:00.000Z",
      issuedActor: "x",
    };
    const kolkata = html(
      printPropsFromRevision({ ...base, timeZone: "Asia/Kolkata" }),
    );
    const newYork = html(
      printPropsFromRevision({ ...base, timeZone: "America/New_York" }),
    );
    expect(kolkata).toContain("15 August 2026");
    expect(newYork).toContain("14 August 2026");
    expect(kolkata).not.toBe(newYork);
  });
});

describe("a revision prints its own sealed content after a successor exists", () => {
  // Revision 1 and its successor are different sealed documents of the same quote. The live quote
  // tables describe only the successor once it begins; the adapter never sees them.
  const revisionOne = canonicalV1Vectors[3]!.snapshot;
  const revisionTwo: CanonicalQuoteSnapshot = {
    ...revisionOne,
    quote: { ...revisionOne.quote, revision_number: 2 },
    commercial: {
      ...revisionOne.commercial,
      notes: "Revised terms only in revision two.",
    },
    totals: {
      ...revisionOne.totals,
      total_minor: revisionOne.totals.total_minor + 99_900,
    },
    items: revisionOne.items.map((item) => ({
      ...item,
      quantity_scaled: item.quantity_scaled + 5,
    })),
  };

  it("revision 1 still shows revision 1's total, notes and quantities", () => {
    const one = html(
      printPropsFromRevision({
        snapshot: revisionOne,
        issuedAt: ISSUED_AT,
        issuedActor: "Aarav Operator",
        timeZone: ZONE,
      }),
    );
    const two = html(
      printPropsFromRevision({
        snapshot: revisionTwo,
        issuedAt: "2026-09-01T09:30:00.000Z",
        issuedActor: "Mira Manager",
        timeZone: ZONE,
      }),
    );
    expect(one).toContain("Installation requires site access.");
    expect(one).not.toContain("Revised terms only in revision two.");
    expect(two).toContain("Revised terms only in revision two.");
    expect(two).not.toContain("Installation requires site access.");
    expect(one).not.toBe(two);
  });

  it("the issuer is the actor of that revision's own issue event, not the newest one", () => {
    const activity = [
      {
        event_type: "quote.revision_issue",
        actor_name_snapshot: "Mira Manager",
        safe_metadata: { revision_id: "rev-2", revision_number: 2 },
      },
      {
        event_type: "quote.revision_issue",
        actor_name_snapshot: "Aarav Operator",
        safe_metadata: { revision_id: "rev-1", revision_number: 1 },
      },
      {
        event_type: "quote.revision_approve",
        actor_name_snapshot: "Someone Else",
        safe_metadata: { revision_id: "rev-1" },
      },
    ];
    expect(issuedActorForRevision(activity, "rev-1")).toBe("Aarav Operator");
    expect(issuedActorForRevision(activity, "rev-2")).toBe("Mira Manager");
    expect(issuedActorForRevision(activity, "rev-3")).toBe("Trace user");
    expect(
      issuedActorForRevision(
        [
          {
            event_type: "quote.revision_issue",
            actor_name_snapshot: "X",
            safe_metadata: null,
          },
        ],
        "rev-1",
      ),
    ).toBe("Trace user");
  });
});

describe("sealed snapshot verification", () => {
  const vector = canonicalV1Vectors[3]!;

  it("accepts a snapshot that hashes to its recorded hash", () => {
    expect(vector.expectedSnapshotHash).toBe(sha256(vector.snapshot));
    expect(
      verifiedSealedSnapshot({
        snapshot: vector.snapshot,
        snapshot_hash: vector.expectedSnapshotHash,
      }),
    ).toBe(vector.snapshot);
    expect(
      verifiedSealedSnapshot({
        snapshot: canonicalV2Vectors[0]!.snapshot,
        snapshot_hash: canonicalV2Vectors[0]!.expectedSnapshotHash,
      }),
    ).toBe(canonicalV2Vectors[0]!.snapshot);
  });

  it("rejects a snapshot whose content changed after sealing", () => {
    const tampered = {
      ...vector.snapshot,
      totals: {
        ...vector.snapshot.totals,
        total_minor: vector.snapshot.totals.total_minor + 1,
      },
    };
    expect(() =>
      verifiedSealedSnapshot({
        snapshot: tampered,
        snapshot_hash: vector.expectedSnapshotHash,
      }),
    ).toThrow(SealedSnapshotError);
  });

  it("rejects a missing snapshot, a missing hash, and a malformed document", () => {
    expect(() =>
      verifiedSealedSnapshot({
        snapshot: null,
        snapshot_hash: vector.expectedSnapshotHash,
      }),
    ).toThrow(SealedSnapshotError);
    expect(() =>
      verifiedSealedSnapshot({
        snapshot: vector.snapshot,
        snapshot_hash: null,
      }),
    ).toThrow(SealedSnapshotError);
    expect(() =>
      verifiedSealedSnapshot({
        snapshot: { format_version: 1 },
        snapshot_hash: vector.expectedSnapshotHash,
      }),
    ).toThrow(SealedSnapshotError);
  });
});

describe("no internal commercial data can reach the print or the PDF", () => {
  const LEAK =
    /cost|margin|approval|reason_code|below_|fingerprint|parent_snapshot|threshold/i;

  function keysAndStrings(value: unknown, out: string[] = []): string[] {
    if (typeof value === "string") out.push(value);
    else if (Array.isArray(value))
      value.forEach((entry) => keysAndStrings(entry, out));
    else if (value && typeof value === "object")
      for (const [key, entry] of Object.entries(value)) {
        out.push(key);
        keysAndStrings(entry, out);
      }
    return out;
  }

  it.each(
    [...canonicalV1Vectors, ...canonicalV2Vectors].map((vector, index) => [
      vector.name,
      index,
    ]),
  )(
    "props and markup for %s carry no cost, margin or approval material",
    (_name, index) => {
      const vector = [...canonicalV1Vectors, ...canonicalV2Vectors][
        index as number
      ]!;
      const props = printPropsFromRevision({
        snapshot: vector.snapshot,
        issuedAt: ISSUED_AT,
        issuedActor: "Aarav Operator",
        timeZone: ZONE,
      });
      expect(keysAndStrings(props).filter((text) => LEAK.test(text))).toEqual(
        [],
      );
      // Visible text only: inline CSS legitimately says "margin".
      expect(html(props).replace(/<[^>]*>/g, " ")).not.toMatch(LEAK);
    },
  );

  it("the adapter reads only sealed commercial fields", () => {
    const source = readFileSync("lib/quotes/issued-print-props.ts", "utf8");
    expect(source).not.toMatch(
      /unit_cost|cost_minor|margin|below_cost|margin_under_floor/,
    );
    expect(source).not.toMatch(
      /approval_policy|reason_codes|\.calculation\b|parent_snapshot_hash/,
    );
    expect(source).not.toMatch(/\.from\(|supabase/i);
  });
});
