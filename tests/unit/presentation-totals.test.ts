import { describe, expect, it } from "vitest";
import {
  calculateQuote,
  type QuoteCalculationInput,
} from "../../lib/quotes/calculate";
import { presentTotals } from "../../lib/quotes/presentation-totals";

function build(
  basis: "exclusive" | "inclusive",
  withCharges: boolean,
  discountedCharge: boolean,
): QuoteCalculationInput {
  return {
    currency_code: "INR",
    tax_mode: basis,
    discount_bps: 1200,
    items: [
      {
        position: 1,
        product_id: "p1",
        sku_snapshot: "P-1",
        description_snapshot: "Line",
        unit_code_snapshot: "EA",
        quantity_precision_snapshot: 0,
        unit_price_minor_snapshot: 112_00,
        currency_code: "INR",
        quantity_scaled: 100,
        quantity_scale: 1,
        tax_code_snapshot: "GST",
        tax_bps_snapshot: 1800,
        tax_price_basis_snapshot: basis,
        tax_treatment_snapshot: "standard",
      },
    ],
    charges: withCharges
      ? [
          {
            position: 1,
            charge_type: "freight",
            description_snapshot: "Freight",
            amount_minor: 750_00,
            currency_code: "INR",
            tax_code_snapshot: "GST",
            tax_bps_snapshot: 1900,
            tax_price_basis_snapshot: basis,
            tax_treatment_snapshot: "standard",
            discount_applies: discountedCharge,
          },
        ]
      : [],
  };
}

describe("presentTotals", () => {
  for (const basis of ["exclusive", "inclusive"] as const) {
    for (const [withCharges, discounted] of [
      [false, false],
      [true, false],
      [true, true],
    ] as const) {
      it(`rows sum to total: ${basis}, charges=${withCharges}, discounted=${discounted}`, () => {
        const r = calculateQuote(build(basis, withCharges, discounted));
        const base = {
          subtotalMinor: r.subtotal_minor,
          discountMinor: r.discount_minor,
          taxMinor: r.tax_minor,
          totalMinor: r.total_minor,
        };
        const direct = presentTotals({
          ...base,
          chargeNetMinor: r.charge_net_minor,
        });
        const derived = presentTotals(base);
        for (const p of [direct, derived]) {
          expect(
            p.subtotalMinor - p.discountMinor + p.taxMinor + p.chargesNetMinor,
          ).toBe(p.totalMinor);
        }
        expect(derived.chargesNetMinor).toBe(r.charge_net_minor);
        expect(direct.taxMinor).toBe(r.item_tax_minor + r.charge_tax_minor);
      });
    }
  }

  it("fixes the 12,522.58 example", () => {
    const p = presentTotals({
      subtotalMinor: 1_120_000,
      discountMinor: 134_400,
      taxMinor: 191_658,
      chargeNetMinor: 75_000,
      totalMinor: 1_252_258,
    });
    expect(p.chargesNetMinor).toBe(75_000);
    expect(
      p.subtotalMinor - p.discountMinor + p.taxMinor + p.chargesNetMinor,
    ).toBe(1_252_258);
  });
});
