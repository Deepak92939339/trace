import { describe, expect, it } from "vitest";
import {
  calculateQuote,
  type QuoteCalculationInput,
} from "../../lib/quotes/calculate";
import { computeMargin } from "../../lib/quotes/margin";

const line = (
  netMinor: number,
  unitCostMinor: number | null,
  quantityScaled = 1,
  quantityScale = 1,
) => ({ netMinor, unitCostMinor, quantityScaled, quantityScale });

describe("computeMargin (mirrors the SQL margin view)", () => {
  it("rounds the margin half up: (1,120,000 - 1,000,000) x 10000 / 1,120,000", () => {
    expect(computeMargin([line(1_120_000, 1_000_000)], null)).toEqual({
      marginBps: 1071,
      floorBps: null,
      linesWithoutCost: 0,
      belowCost: false,
      underFloor: false,
    });
  });

  it("flags below cost and applies the sign after rounding the magnitude", () => {
    const result = computeMargin([line(1_120_000, 1_200_000)], null);
    expect(result.marginBps).toBe(-714);
    expect(result.belowCost).toBe(true);
    expect(result.underFloor).toBe(false);
  });

  it("flags both codes when below cost with a floor set", () => {
    const result = computeMargin([line(1_120_000, 1_200_000)], 2000);
    expect(result.belowCost).toBe(true);
    expect(result.underFloor).toBe(true);
  });

  it("compares the floor exactly, not against the rounded margin", () => {
    const lines = [line(1_120_000, 1_000_000)]; // exact margin 1071.43 bps
    expect(computeMargin(lines, 1071).underFloor).toBe(false);
    expect(computeMargin(lines, 1072).underFloor).toBe(true);
  });

  it("a tiny loss that rounds to 0 bps is still below cost", () => {
    const result = computeMargin([line(1_000_000, 1_000_001)], null);
    expect(result.marginBps).toBe(0);
    expect(result.belowCost).toBe(true);
  });

  it("returns no margin and no reason flags for zero net revenue", () => {
    const result = computeMargin([line(0, 1_000_000)], 5000);
    expect(result).toEqual({
      marginBps: null,
      floorBps: 5000,
      linesWithoutCost: 0,
      belowCost: false,
      underFloor: false,
    });
  });

  it("excludes lines without cost and counts them", () => {
    const result = computeMargin(
      [line(1_120_000, 1_000_000), line(185_000, null)],
      null,
    );
    expect(result.marginBps).toBe(1071);
    expect(result.linesWithoutCost).toBe(1);
  });

  it("returns null margin when no line has a cost", () => {
    const result = computeMargin([line(185_000, null)], 2000);
    expect(result.marginBps).toBeNull();
    expect(result.linesWithoutCost).toBe(1);
    expect(result.underFloor).toBe(false);
  });

  it("uses the kernel rounding for per-line cost on fractional quantities", () => {
    // revenue 606,450; cost round(100001 x 1.555) = 155,502; margin 7436 bps
    expect(
      computeMargin([line(606_450, 100_001, 1555, 1000)], null).marginBps,
    ).toBe(7436);
  });

  it("in tax-inclusive mode revenue is the line net ex-tax, not the gross price", () => {
    const input: QuoteCalculationInput = {
      currency_code: "INR",
      tax_mode: "inclusive",
      discount_bps: 0,
      items: [
        {
          position: 1,
          product_id: "p1",
          sku_snapshot: "PCA-220",
          description_snapshot: "Precision coupling assembly",
          unit_code_snapshot: "EA",
          quantity_precision_snapshot: 0,
          unit_price_minor_snapshot: 1_120_000,
          currency_code: "INR",
          quantity_scaled: 1,
          quantity_scale: 1,
          tax_code_snapshot: "GST",
          tax_bps_snapshot: 1800,
          tax_price_basis_snapshot: "inclusive",
          tax_treatment_snapshot: "standard",
        },
      ],
      charges: [],
    };
    const quote = calculateQuote(input);
    const net = quote.items[0]!.net_minor;
    expect(net).toBe(949_153);
    expect(computeMargin([line(net, 800_000)], null).marginBps).toBe(1571);
    expect(
      computeMargin([line(quote.items[0]!.line_total_minor, 800_000)], null)
        .marginBps,
    ).toBe(2857);
  });

  it("discount reduces revenue but not cost", () => {
    const input: QuoteCalculationInput = {
      currency_code: "INR",
      tax_mode: "exclusive",
      discount_bps: 1250,
      items: [
        {
          position: 1,
          product_id: "p1",
          sku_snapshot: "S",
          description_snapshot: "D",
          unit_code_snapshot: "EA",
          quantity_precision_snapshot: 0,
          unit_price_minor_snapshot: 10_000,
          currency_code: "INR",
          quantity_scaled: 2,
          quantity_scale: 1,
          tax_code_snapshot: "GST",
          tax_bps_snapshot: 1800,
          tax_price_basis_snapshot: "exclusive",
          tax_treatment_snapshot: "standard",
        },
      ],
      charges: [],
    };
    const net = calculateQuote(input).items[0]!.net_minor;
    expect(net).toBe(17_500);
    // cost 13,000 -> (17,500 - 13,000) x 10000 / 17,500 = 2571.43
    expect(computeMargin([line(net, 6_500, 2, 1)], 3000)).toMatchObject({
      marginBps: 2571,
      underFloor: true,
    });
  });
});
