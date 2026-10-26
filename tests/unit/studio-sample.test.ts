import { describe, expect, it } from "vitest";
import { formatMinor } from "../../lib/formatting/money";
import {
  calculateQuote,
  type QuoteCalculationItemInput,
} from "../../lib/quotes/calculate";
import { SAMPLE_PRINT_DATA } from "../../lib/studio/sample";

// The built-in sample preview is a set of fixed strings. This test recomputes the same quotation with the real calculator
// and checks every money string and the payment schedule, so the fixture cannot drift from sealed-quote arithmetic.
const LINES: ReadonlyArray<
  [
    sku: string,
    unit: QuoteCalculationItemInput["unit_code_snapshot"],
    priceMinor: number,
    qty: number,
  ]
> = [
  ["NS-FR-4402", "EA", 125000, 4],
  ["NS-RL-316", "M", 8500, 12],
  ["NS-CP-06", "EA", 34000, 6],
  ["NS-PC-7016", "KG", 8500, 8],
  ["NS-VB-210", "EA", 2150, 24],
  ["NS-SV-001", "EA", 45000, 1],
];
const gst = {
  tax_code_snapshot: "GST18",
  tax_bps_snapshot: 1800,
  tax_price_basis_snapshot: "exclusive" as const,
  tax_treatment_snapshot: "standard" as const,
};
const calculated = calculateQuote({
  currency_code: "INR",
  tax_mode: "exclusive",
  discount_bps: 0,
  items: LINES.map(([sku, unit, price, qty], index) => ({
    position: index + 1,
    product_id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    sku_snapshot: sku,
    description_snapshot: sku,
    unit_code_snapshot: unit,
    quantity_precision_snapshot: 0,
    unit_price_minor_snapshot: price,
    currency_code: "INR",
    quantity_scaled: qty,
    quantity_scale: 1,
    ...gst,
  })),
  charges: [
    {
      position: 1,
      charge_type: "freight",
      description_snapshot: "Freight and handling",
      amount_minor: 185000,
      currency_code: "INR",
      discount_applies: false,
      ...gst,
    },
  ],
});
const money = (minor: number) => formatMinor(minor, "INR", "en-IN");

describe("built-in sample preview data", () => {
  it("matches the real calculator for lines, charge and totals", () => {
    const d = SAMPLE_PRINT_DATA;
    expect(d.items).toHaveLength(6);
    expect(new Set(d.items.map((i) => i.description)).size).toBe(6);
    d.items.forEach((item, index) => {
      expect(item.sku).toBe(LINES[index]![0]);
      expect(item.unit).toBe(LINES[index]![1]);
      expect(item.rate).toBe(money(LINES[index]![2]));
      expect(item.qty).toBe(String(LINES[index]![3]));
      expect(item.amount).toBe(money(calculated.items[index]!.net_minor));
    });
    const charge = calculated.charges[0]!;
    expect(d.charges).toEqual([
      expect.objectContaining({
        amount: money(charge.net_minor),
        tax: money(charge.tax_minor),
        total: money(charge.net_minor + charge.tax_minor),
      }),
    ]);
    expect(d.totals).toEqual({
      subtotal: money(calculated.subtotal_minor),
      discount: money(calculated.discount_minor),
      tax: money(calculated.tax_minor),
      charges: money(calculated.charge_net_minor),
      grand: money(calculated.total_minor),
    });
    expect(d.tokens["totals.grand"]).toBe(d.totals.grand);
    expect(d.tokens["totals.subtotal"]).toBe(d.totals.subtotal);
    expect(d.tokens["totals.tax"]).toBe(d.totals.tax);
  });
  it("has a two-milestone schedule that sums to the grand total", () => {
    const shares = SAMPLE_PRINT_DATA.paymentSchedule;
    expect(shares.map((s) => s.share)).toEqual(["50.00%", "50.00%"]);
    expect(shares.map((s) => s.amount)).toEqual([
      money(calculated.total_minor / 2),
      money(calculated.total_minor / 2),
    ]);
    expect(calculated.total_minor % 2).toBe(0);
  });
  it("is self-consistent about the fictional seller and customer", () => {
    const text = JSON.stringify(SAMPLE_PRINT_DATA);
    for (const leftover of [
      "Peenya",
      "Plot 14",
      "CIN",
      "Bengaluru",
      "Vadodara",
      "Rahul",
    ])
      expect(text).not.toContain(leftover);
    expect(SAMPLE_PRINT_DATA.tokens["seller.name"]).toBe(
      SAMPLE_PRINT_DATA.seller.name,
    );
    expect(SAMPLE_PRINT_DATA.tokens["customer.name"]).toBe(
      SAMPLE_PRINT_DATA.customer.name,
    );
  });
});
