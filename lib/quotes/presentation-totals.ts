export type PresentTotalsInput = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number; // item tax + charge tax
  totalMinor: number;
  /** Net charges when the source stores it (preferred). */
  chargeNetMinor?: number | null;
};

export type PresentedTotals = {
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  chargesNetMinor: number;
  totalMinor: number;
};

/**
 * Presentation-only totals whose rows sum exactly to the Total:
 * subtotal - discount + tax + chargesNet = total (both tax modes).
 * Net charges are read directly when stored; otherwise derived from the
 * identity: total - subtotal + discount - tax.
 */
export function presentTotals(input: PresentTotalsInput): PresentedTotals {
  const chargesNetMinor =
    input.chargeNetMinor ??
    input.totalMinor -
      input.subtotalMinor +
      input.discountMinor -
      input.taxMinor;
  return {
    subtotalMinor: input.subtotalMinor,
    discountMinor: input.discountMinor,
    taxMinor: input.taxMinor,
    chargesNetMinor,
    totalMinor: input.totalMinor,
  };
}
