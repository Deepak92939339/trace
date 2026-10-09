import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  calculateQuote,
  CHARGE_TYPES,
  CURRENCY_CODES,
  TAX_TREATMENTS,
  UNIT_CODES,
  type QuoteCalculationInput,
} from "../lib/quotes/calculate.ts";
import { allocateMilestoneAmounts } from "../lib/quotes/payment-schedule.ts";

let state = 0x74e6d123;
function random(max: number) {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) % max;
}

function pick<const T extends readonly unknown[]>(
  values: T,
  index: number,
): T[number] {
  return values[index % values.length]!;
}

function makeCase(caseIndex: number): QuoteCalculationInput {
  const currency = pick(CURRENCY_CODES, random(CURRENCY_CODES.length));
  const taxMode =
    caseIndex % 2 === 0 ? ("exclusive" as const) : ("inclusive" as const);
  const discounts = [0, 1, 999, 1250, 3333, 5000, 9999, 10_000];
  const discount =
    caseIndex % 9 === 0 ? pick(discounts, caseIndex) : random(10_001);
  const items = Array.from({ length: 1 + random(4) }, (_, itemIndex) => {
    const unit = pick(UNIT_CODES, random(UNIT_CODES.length));
    const precision = unit === "EA" || unit === "BOX" ? 0 : random(4);
    const scale = 10 ** precision;
    const rates = [0, 1, 500, 825, 1800, 1900, 2000, 9999, 10_000];
    return {
      position: itemIndex + 1,
      product_id: `case-${caseIndex}-product-${itemIndex}`,
      sku_snapshot: `SKU-${caseIndex}-${itemIndex}`,
      description_snapshot: `Deterministic item ${caseIndex}.${itemIndex}`,
      unit_code_snapshot: unit,
      quantity_precision_snapshot: precision,
      unit_price_minor_snapshot:
        1 + random(caseIndex % 17 === 0 ? 900_000_000 : 2_000_000),
      currency_code: currency,
      quantity_scaled:
        1 + random(unit === "EA" || unit === "BOX" ? 500 : 2_000_000),
      quantity_scale: scale,
      tax_code_snapshot: `T${pick(rates, caseIndex + itemIndex)}`,
      tax_bps_snapshot: pick(rates, caseIndex + itemIndex),
      tax_price_basis_snapshot:
        (caseIndex + itemIndex) % 2
          ? ("inclusive" as const)
          : ("exclusive" as const),
      tax_treatment_snapshot: pick(TAX_TREATMENTS, caseIndex + itemIndex),
    };
  });
  const charges = Array.from({ length: random(4) }, (_, chargeIndex) => {
    const rates = [0, 500, 825, 1800, 1900, 2000, 10_000];
    return {
      position: chargeIndex + 1,
      charge_type: pick(CHARGE_TYPES, caseIndex + chargeIndex),
      description_snapshot: `Deterministic charge ${caseIndex}.${chargeIndex}`,
      amount_minor: random(caseIndex % 23 === 0 ? 9_000_000_000 : 1_000_000),
      currency_code: currency,
      tax_code_snapshot: `C${pick(rates, caseIndex + chargeIndex)}`,
      tax_bps_snapshot: pick(rates, caseIndex + chargeIndex),
      tax_price_basis_snapshot:
        (caseIndex + chargeIndex) % 2
          ? ("exclusive" as const)
          : ("inclusive" as const),
      tax_treatment_snapshot: pick(TAX_TREATMENTS, caseIndex + chargeIndex + 1),
      discount_applies: (caseIndex + chargeIndex) % 3 === 0,
    };
  });
  return {
    currency_code: currency,
    tax_mode: taxMode,
    discount_bps: discount,
    items,
    charges,
  };
}

const inputs = Array.from({ length: 5_000 }, (_, index) => makeCase(index));
const expected = inputs.map(calculateQuote);

const batchSize = 100;
for (let offset = 0; offset < inputs.length; offset += batchSize) {
  const batch = inputs.slice(offset, offset + batchSize);
  const sql = `
    select coalesce(
      jsonb_agg(public.calculate_quote_payload(source.value) order by source.ordinality),
      '[]'::jsonb
    )
    from jsonb_array_elements(
      $tender_parity$${JSON.stringify(batch)}$tender_parity$::jsonb
    ) with ordinality source(value, ordinality);
  `;
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_tender-local-visual-study",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-AtX",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: sql,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (result.error) {
    throw new Error(
      `Privileged local parity execution could not start: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `Privileged local parity execution failed for group ${offset}: ${result.stderr.trim()}`,
    );
  }
  const actual = JSON.parse(result.stdout.trim()) as ReturnType<
    typeof calculateQuote
  >[];
  assert.deepStrictEqual(
    actual,
    expected.slice(offset, offset + batchSize),
    `TypeScript/SQL mismatch in group beginning ${offset}.`,
  );
}

console.log(
  `PASS 5000 deterministic TypeScript/SQL quote calculation cases matched exactly.`,
);

// Payment milestone amounts: the TypeScript allocator and public.quote_milestone_amounts
// must agree on every amount, and on which schedules are invalid.
type MilestoneCase = { total: number; bps: number[] };

function splitBasisPoints(parts: number) {
  const cuts = new Set<number>();
  while (cuts.size < parts - 1) cuts.add(1 + random(9_999));
  const sorted = [0, ...[...cuts].sort((a, b) => a - b), 10_000];
  return sorted.slice(1).map((cut, index) => cut - sorted[index]!);
}

const milestoneCases: MilestoneCase[] = [
  { total: 832_572, bps: [5000, 3000, 2000] },
  { total: 100, bps: [3333, 3333, 3334] },
  { total: 1, bps: [5000, 5000] },
  { total: 2, bps: [2500, 2500, 2500, 2500] },
  { total: 0, bps: [10_000] },
  { total: 1000, bps: [5000, 4000] },
  { total: 1000, bps: [0, 10_000] },
  { total: 1000, bps: Array.from({ length: 13 }, () => 1) },
  { total: Number.MAX_SAFE_INTEGER, bps: [3333, 3333, 3334] },
  { total: Number.MAX_SAFE_INTEGER, bps: [1].concat([9999]) },
];
for (let index = 0; index < 2_000; index += 1) {
  const parts = 1 + random(index % 11 === 0 ? 12 : 6);
  const totals = [random(60), random(10_000_000), 1 + random(2_000_000_000)];
  milestoneCases.push({
    total:
      index % 17 === 0
        ? Number.MAX_SAFE_INTEGER - random(1_000)
        : totals[index % 3]!,
    bps: splitBasisPoints(parts),
  });
}

function allocateOrInvalid(total: number, bps: number[]) {
  try {
    return allocateMilestoneAmounts(total, bps);
  } catch {
    return "invalid";
  }
}

const milestoneExpected = milestoneCases.map(({ total, bps }) =>
  allocateOrInvalid(total, bps),
);
assert.deepStrictEqual(
  milestoneExpected.slice(0, 3),
  [
    [416_286, 249_772, 166_514],
    [33, 33, 34],
    [1, 0],
  ],
  "required milestone examples",
);
for (let offset = 0; offset < milestoneCases.length; offset += batchSize) {
  const batch = milestoneCases.slice(offset, offset + batchSize);
  const sql = `
    create function pg_temp.milestone_amounts(p_total bigint, p_bps integer[])
    returns jsonb language plpgsql as $f$
    begin
      return to_jsonb(public.quote_milestone_amounts(p_total, p_bps));
    exception when sqlstate '22023' then
      return '"invalid"'::jsonb;
    end;
    $f$;
    select coalesce(jsonb_agg(
      pg_temp.milestone_amounts(
        (source.value->>'total')::bigint,
        array(select value::integer from jsonb_array_elements_text(source.value->'bps'))
      ) order by source.ordinality
    ), '[]'::jsonb)
    from jsonb_array_elements(
      $tender_parity$${JSON.stringify(batch)}$tender_parity$::jsonb
    ) with ordinality source(value, ordinality);
  `;
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "supabase_db_tender-local-visual-study",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-AtX",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      `Privileged local milestone parity failed at ${offset}: ${result.error?.message ?? result.stderr.trim()}`,
    );
  }
  const lastLine = result.stdout.trim().split("\n").pop()!;
  assert.deepStrictEqual(
    JSON.parse(lastLine),
    milestoneExpected.slice(offset, offset + batchSize),
    `TypeScript/SQL milestone mismatch in group beginning ${offset}.`,
  );
}

console.log(
  `PASS ${milestoneCases.length} TypeScript/SQL payment milestone allocations matched exactly (including 832572 at 5000/3000/2000 -> 416286/249772/166514).`,
);
