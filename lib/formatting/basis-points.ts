/**
 * Integer-only basis-point formatting: 2571 → "25.71%", -1 → "−0.01%".
 * No floating point, so display never drifts from the stored integer.
 */
export function formatBasisPoints(bps: number): string {
  if (!Number.isSafeInteger(bps))
    throw new RangeError("bps must be a safe integer");
  const sign = bps < 0 ? "−" : "";
  const magnitude = bps < 0 ? -bps : bps;
  const whole = (magnitude - (magnitude % 100)) / 100;
  const fraction = String(magnitude % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}%`;
}

/**
 * Parses a percent typed by a person ("25", "33.3", "33.33") into integer
 * basis points without floating point. Returns null for anything else,
 * including more than two decimals or values above 100.
 */
export function parsePercentToBps(input: string): number | null {
  const match = /^\s*(\d{1,3})(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const bps = whole * 100 + fraction;
  return bps <= 10_000 ? bps : null;
}

/** Basis points as an editable percent string: 2500 → "25", 3333 → "33.33". */
export function bpsToPercentInput(bps: number): string {
  if (!Number.isSafeInteger(bps) || bps < 0) return "";
  const whole = (bps - (bps % 100)) / 100;
  const fraction = bps % 100;
  return fraction === 0
    ? String(whole)
    : `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}
