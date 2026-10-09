/**
 * TypeScript mirror of the SQL view public.quote_margin_calc, used for unit
 * tests only. Production margin is computed in the database at submission.
 *
 * Net revenue is the line net after discount, excluding tax and charges, over
 * lines that have a cost. Cost per line is round-half-up(cost x quantity_scaled
 * / quantity_scale), the kernel rule. `marginBps` is the rounded display value
 * (sign applied after rounding the magnitude); `belowCost` and `underFloor` use
 * exact integer comparisons, never the rounded value.
 */
export type MarginLineInput = {
  netMinor: number;
  unitCostMinor: number | null;
  quantityScaled: number;
  quantityScale: number;
};

export type MarginResult = {
  marginBps: number | null;
  floorBps: number | null;
  linesWithoutCost: number;
  belowCost: boolean;
  underFloor: boolean;
};

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function computeMargin(
  lines: MarginLineInput[],
  floorBps: number | null,
): MarginResult {
  let revenue = 0n;
  let cost = 0n;
  let costed = 0;
  let linesWithoutCost = 0;
  for (const line of lines) {
    if (line.unitCostMinor === null) {
      linesWithoutCost += 1;
      continue;
    }
    costed += 1;
    revenue += BigInt(line.netMinor);
    const scale = BigInt(line.quantityScale);
    cost +=
      (BigInt(line.unitCostMinor) * BigInt(line.quantityScaled) + scale / 2n) /
      scale;
  }
  if (costed === 0 || revenue <= 0n) {
    return {
      marginBps: null,
      floorBps,
      linesWithoutCost,
      belowCost: false,
      underFloor: false,
    };
  }
  const gap = revenue - cost;
  const absoluteGap = gap < 0n ? -gap : gap;
  let magnitude = (absoluteGap * 10_000n + revenue / 2n) / revenue;
  if (magnitude > MAX_SAFE) magnitude = MAX_SAFE;
  return {
    marginBps: Number(gap < 0n ? -magnitude : magnitude),
    floorBps,
    linesWithoutCost,
    belowCost: cost > revenue,
    underFloor: floorBps !== null && gap * 10_000n < BigInt(floorBps) * revenue,
  };
}
