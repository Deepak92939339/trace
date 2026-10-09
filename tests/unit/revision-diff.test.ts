import { describe, expect, it } from "vitest";
import type {
  CanonicalQuoteSnapshotV1,
  CanonicalSnapshotChargeV1,
  CanonicalSnapshotItemV1,
} from "../../lib/quotes/canonical-snapshot";
import { diffSnapshots } from "../../lib/quotes/revision-diff";

function item(id: string, over: Partial<CanonicalSnapshotItemV1> = {}) {
  return {
    id,
    position: 1,
    product_id: null,
    sku: `SKU-${id}`,
    description: `Item ${id}`,
    unit_code: "EA",
    quantity_precision: 0,
    unit_price_minor: 10_000,
    currency_code: "INR",
    quantity_scaled: 2,
    quantity_scale: 1,
    tax_code: "GST",
    tax_bps: 1800,
    tax_price_basis: "exclusive",
    tax_treatment: "standard",
    base_minor: 20_000,
    discount_minor: 0,
    net_minor: 20_000,
    tax_minor: 3_600,
    line_total_minor: 23_600,
    ...over,
  } satisfies CanonicalSnapshotItemV1;
}

function charge(id: string, over: Partial<CanonicalSnapshotChargeV1> = {}) {
  return {
    id,
    position: 1,
    charge_type: "freight",
    description: `Charge ${id}`,
    amount_minor: 5_000,
    currency_code: "INR",
    tax_code: "GST",
    tax_bps: 1800,
    tax_price_basis: "exclusive",
    tax_treatment: "standard",
    discount_applies: false,
    discount_minor: 0,
    net_minor: 5_000,
    tax_minor: 900,
    total_minor: 5_900,
    ...over,
  } satisfies CanonicalSnapshotChargeV1;
}

function snapshot(
  over: {
    items?: CanonicalSnapshotItemV1[];
    charges?: CanonicalSnapshotChargeV1[];
    discount_bps?: number;
    currency?: string;
    notes?: string;
    totals?: Partial<CanonicalQuoteSnapshotV1["totals"]>;
  } = {},
): CanonicalQuoteSnapshotV1 {
  return {
    format_version: 1,
    quote: {
      id: "q",
      number: "Q-1",
      revision_number: 1,
      parent_snapshot_hash: null,
    },
    seller: {} as CanonicalQuoteSnapshotV1["seller"],
    buyer: {} as CanonicalQuoteSnapshotV1["buyer"],
    commercial: {
      currency_code: over.currency ?? "INR",
      locale: "en-IN",
      tax_label: "GST",
      tax_mode: "exclusive",
      customer_tax_treatment: "standard",
      discount_bps: over.discount_bps ?? 0,
      issue_date: "2026-01-01",
      valid_until: "2026-02-01",
      notes: over.notes ?? "",
    },
    items: over.items ?? [item("a")],
    charges: over.charges ?? [],
    totals: {
      subtotal_minor: 20_000,
      discount_minor: 0,
      item_tax_minor: 3_600,
      charge_net_minor: 0,
      charge_tax_minor: 0,
      tax_minor: 3_600,
      charges_minor: 0,
      total_minor: 23_600,
      ...over.totals,
    },
    approval_policy: {
      threshold_bps: 1000,
      requires_manual_approval: false,
      reason_codes: [],
    },
    calculation: { format_version: 1, fingerprint: "f" },
  };
}

describe("diffSnapshots", () => {
  it("reports everything as added when there is no base", () => {
    const rows = diffSnapshots(null, snapshot());
    expect(rows.map((r) => r.key)).toEqual([
      "item:a:added",
      "valid_until",
      "subtotal",
      "tax",
      "total",
    ]);
    expect(rows[0]).toMatchObject({ beforeMinor: null, deltaMinor: 23_600 });
  });

  it("shows a discount-only change with its totals", () => {
    const rows = diffSnapshots(
      snapshot(),
      snapshot({
        discount_bps: 1250,
        totals: {
          discount_minor: 2_500,
          tax_minor: 3_150,
          total_minor: 20_650,
        },
      }),
    );
    expect(rows[0]).toEqual({
      key: "discount",
      label: "Discount",
      beforeText: "0.00%",
      afterText: "12.50%",
    });
    expect(rows.find((r) => r.key === "total")?.deltaMinor).toBe(-2_950);
  });

  it("detects an added item", () => {
    const rows = diffSnapshots(
      snapshot(),
      snapshot({ items: [item("a"), item("b")] }),
    );
    expect(rows).toEqual([
      expect.objectContaining({ key: "item:b:added", deltaMinor: 23_600 }),
    ]);
  });

  it("detects a removed item", () => {
    const rows = diffSnapshots(
      snapshot({ items: [item("a"), item("b")] }),
      snapshot(),
    );
    expect(rows).toEqual([
      expect.objectContaining({ key: "item:b:removed", deltaMinor: -23_600 }),
    ]);
  });

  it("detects a quantity change", () => {
    const rows = diffSnapshots(
      snapshot(),
      snapshot({ items: [item("a", { quantity_scaled: 5 })] }),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        key: "item:a:quantity",
        beforeText: "2 EA",
        afterText: "5 EA",
      }),
    ]);
  });

  it("detects a unit price change", () => {
    const rows = diffSnapshots(
      snapshot(),
      snapshot({ items: [item("a", { unit_price_minor: 12_500 })] }),
    );
    expect(rows).toEqual([
      {
        key: "item:a:unit_price",
        label: "Unit price: Item a",
        beforeMinor: 10_000,
        afterMinor: 12_500,
        deltaMinor: 2_500,
      },
    ]);
  });

  it("detects charge changes and uses net charges, not charges_minor", () => {
    const rows = diffSnapshots(
      snapshot({
        charges: [charge("c")],
        totals: {
          charge_net_minor: 5_000,
          charge_tax_minor: 900,
          charges_minor: 5_900,
          total_minor: 29_500,
          tax_minor: 4_500,
        },
      }),
      snapshot({
        charges: [charge("c", { amount_minor: 7_000 })],
        totals: {
          charge_net_minor: 7_000,
          charge_tax_minor: 1_260,
          charges_minor: 8_260,
          total_minor: 31_860,
          tax_minor: 4_860,
        },
      }),
    );
    const amount = rows.find((r) => r.key === "charge:c:amount");
    expect(amount).toMatchObject({
      beforeMinor: 5_000,
      afterMinor: 7_000,
      deltaMinor: 2_000,
    });
    expect(rows.find((r) => r.key === "charges_net")).toMatchObject({
      beforeMinor: 5_000,
      afterMinor: 7_000,
      deltaMinor: 2_000,
    });
  });

  it("returns nothing when nothing changed", () => {
    expect(diffSnapshots(snapshot(), snapshot())).toEqual([]);
  });

  it("throws on currency mismatch", () => {
    expect(() =>
      diffSnapshots(snapshot(), snapshot({ currency: "USD" })),
    ).toThrow(/currenc/);
  });

  it("shows that notes changed without their text", () => {
    const rows = diffSnapshots(
      snapshot({ notes: "old secret" }),
      snapshot({ notes: "new secret" }),
    );
    expect(rows).toEqual([
      { key: "notes", label: "Notes", beforeText: "No", afterText: "Changed" },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/secret/);
  });
});
