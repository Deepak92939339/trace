import type {
  CanonicalQuoteSnapshot,
  CanonicalSnapshotChargeV1,
  CanonicalSnapshotItemV1,
} from "./canonical-snapshot.ts";
import type {
  PaymentScheduleEntryV2,
  PaymentTrigger,
} from "./payment-schedule.ts";

/**
 * One changed commercial fact between two revision snapshots. Money is integer
 * minor units only; `deltaMinor = after - before` (a missing side counts as 0).
 * `CommercialDiffProjection` is path/hash based and cannot carry per-row
 * before/after values, so rows are a separate, display-oriented shape.
 */
export type DiffRow = {
  key: string;
  label: string;
  beforeMinor?: number | null;
  afterMinor?: number | null;
  beforeText?: string | null;
  afterText?: string | null;
  deltaMinor?: number;
};

function percentText(bps: number) {
  const whole = Math.trunc(bps / 100);
  const fraction = String(bps % 100).padStart(2, "0");
  return `${whole}.${fraction}%`;
}

function quantityText(item: CanonicalSnapshotItemV1) {
  const scaled = BigInt(item.quantity_scaled);
  const scale = BigInt(item.quantity_scale);
  const whole = scaled / scale;
  if (item.quantity_precision === 0) return `${whole} ${item.unit_code}`;
  const fraction = String(scaled % scale).padStart(
    item.quantity_precision,
    "0",
  );
  return `${whole}.${fraction} ${item.unit_code}`;
}

function sameQuantity(a: CanonicalSnapshotItemV1, b: CanonicalSnapshotItemV1) {
  return (
    BigInt(a.quantity_scaled) * BigInt(b.quantity_scale) ===
    BigInt(b.quantity_scaled) * BigInt(a.quantity_scale)
  );
}

function moneyRow(
  key: string,
  label: string,
  before: number,
  after: number,
): DiffRow | null {
  if (before === after) return null;
  return {
    key,
    label,
    beforeMinor: before,
    afterMinor: after,
    deltaMinor: after - before,
  };
}

const TRIGGER_TEXT: Record<PaymentTrigger, string> = {
  on_acceptance: "On acceptance",
  on_delivery: "On delivery",
  on_completion: "On completion",
  on_date: "On a date",
};

function scheduleOf(
  snapshot: CanonicalQuoteSnapshot | null,
): PaymentScheduleEntryV2[] {
  return snapshot && snapshot.format_version === 2
    ? snapshot.payment_schedule
    : [];
}

function milestoneSummary(entry: PaymentScheduleEntryV2) {
  const when =
    entry.trigger === "on_date" && entry.due_date !== null
      ? `on ${entry.due_date}`
      : TRIGGER_TEXT[entry.trigger].toLowerCase();
  return `${entry.label}, ${percentText(entry.basis_points)}, ${when}`;
}

/**
 * Payment schedule rows as text. Milestones carry no id, so they are matched by
 * position. A v1 snapshot (no schedule) compares as an empty schedule, so a
 * schedule added or dropped in a later revision shows as added or removed.
 */
function scheduleRows(
  base: PaymentScheduleEntryV2[],
  candidate: PaymentScheduleEntryV2[],
): DiffRow[] {
  const rows: DiffRow[] = [];
  const baseByPosition = new Map(base.map((entry) => [entry.position, entry]));
  const candidatePositions = new Set(candidate.map((entry) => entry.position));
  for (const entry of candidate) {
    const before = baseByPosition.get(entry.position);
    const prefix = `payment:${entry.position}`;
    if (!before) {
      rows.push({
        key: `${prefix}:added`,
        label: `Payment milestone ${entry.position} added`,
        beforeText: null,
        afterText: milestoneSummary(entry),
      });
      continue;
    }
    if (before.label !== entry.label) {
      rows.push({
        key: `${prefix}:label`,
        label: `Payment milestone ${entry.position} label`,
        beforeText: before.label,
        afterText: entry.label,
      });
    }
    if (before.basis_points !== entry.basis_points) {
      rows.push({
        key: `${prefix}:basis_points`,
        label: `Payment milestone ${entry.position} share`,
        beforeText: percentText(before.basis_points),
        afterText: percentText(entry.basis_points),
      });
    }
    if (before.trigger !== entry.trigger) {
      rows.push({
        key: `${prefix}:trigger`,
        label: `Payment milestone ${entry.position} timing`,
        beforeText: TRIGGER_TEXT[before.trigger],
        afterText: TRIGGER_TEXT[entry.trigger],
      });
    }
    if (before.due_date !== entry.due_date) {
      rows.push({
        key: `${prefix}:due_date`,
        label: `Payment milestone ${entry.position} date`,
        beforeText: before.due_date,
        afterText: entry.due_date,
      });
    }
  }
  for (const entry of base) {
    if (candidatePositions.has(entry.position)) continue;
    rows.push({
      key: `payment:${entry.position}:removed`,
      label: `Payment milestone ${entry.position} removed`,
      beforeText: milestoneSummary(entry),
      afterText: null,
    });
  }
  return rows;
}

function itemRows(
  base: CanonicalSnapshotItemV1[],
  candidate: CanonicalSnapshotItemV1[],
): DiffRow[] {
  const rows: DiffRow[] = [];
  const baseById = new Map(base.map((item) => [item.id, item]));
  const candidateIds = new Set(candidate.map((item) => item.id));
  for (const item of candidate) {
    const before = baseById.get(item.id);
    const name = item.description || item.sku;
    if (!before) {
      rows.push({
        key: `item:${item.id}:added`,
        label: `Item added: ${name}`,
        beforeMinor: null,
        afterMinor: item.line_total_minor,
        afterText: quantityText(item),
        deltaMinor: item.line_total_minor,
      });
      continue;
    }
    if (!sameQuantity(before, item)) {
      rows.push({
        key: `item:${item.id}:quantity`,
        label: `Quantity: ${name}`,
        beforeText: quantityText(before),
        afterText: quantityText(item),
      });
    }
    const price = moneyRow(
      `item:${item.id}:unit_price`,
      `Unit price: ${name}`,
      before.unit_price_minor,
      item.unit_price_minor,
    );
    if (price) rows.push(price);
  }
  for (const item of base) {
    if (candidateIds.has(item.id)) continue;
    rows.push({
      key: `item:${item.id}:removed`,
      label: `Item removed: ${item.description || item.sku}`,
      beforeMinor: item.line_total_minor,
      afterMinor: null,
      beforeText: quantityText(item),
      deltaMinor: -item.line_total_minor,
    });
  }
  return rows;
}

function chargeRows(
  base: CanonicalSnapshotChargeV1[],
  candidate: CanonicalSnapshotChargeV1[],
): DiffRow[] {
  const rows: DiffRow[] = [];
  const baseById = new Map(base.map((charge) => [charge.id, charge]));
  const candidateIds = new Set(candidate.map((charge) => charge.id));
  for (const charge of candidate) {
    const before = baseById.get(charge.id);
    const name = charge.description || charge.charge_type;
    if (!before) {
      rows.push({
        key: `charge:${charge.id}:added`,
        label: `Charge added: ${name}`,
        beforeMinor: null,
        afterMinor: charge.amount_minor,
        deltaMinor: charge.amount_minor,
      });
      continue;
    }
    const amount = moneyRow(
      `charge:${charge.id}:amount`,
      `Charge amount: ${name}`,
      before.amount_minor,
      charge.amount_minor,
    );
    if (amount) rows.push(amount);
  }
  for (const charge of base) {
    if (candidateIds.has(charge.id)) continue;
    rows.push({
      key: `charge:${charge.id}:removed`,
      label: `Charge removed: ${charge.description || charge.charge_type}`,
      beforeMinor: charge.amount_minor,
      afterMinor: null,
      deltaMinor: -charge.amount_minor,
    });
  }
  return rows;
}

/**
 * Changed rows from `base` to `candidate`, in a fixed order: discount, items,
 * charges, valid until, notes, payment schedule, subtotal, tax, net charges,
 * total. With no base,
 * everything non-default in the candidate is reported as added. Notes report
 * only that they changed, never their text. Net charges use
 * `totals.charge_net_minor`, never `charges_minor`.
 */
export function diffSnapshots(
  base: CanonicalQuoteSnapshot | null,
  candidate: CanonicalQuoteSnapshot,
): DiffRow[] {
  if (
    base &&
    base.commercial.currency_code !== candidate.commercial.currency_code
  ) {
    throw new RangeError("Cannot diff snapshots with different currencies.");
  }
  const rows: DiffRow[] = [];
  const push = (row: DiffRow | null) => {
    if (row) rows.push(row);
  };

  const beforeDiscount = base?.commercial.discount_bps ?? 0;
  const afterDiscount = candidate.commercial.discount_bps;
  if (beforeDiscount !== afterDiscount) {
    rows.push({
      key: "discount",
      label: "Discount",
      beforeText: base ? percentText(beforeDiscount) : null,
      afterText: percentText(afterDiscount),
    });
  }

  rows.push(...itemRows(base?.items ?? [], candidate.items));
  rows.push(...chargeRows(base?.charges ?? [], candidate.charges));

  const beforeValid = base?.commercial.valid_until ?? null;
  if (beforeValid !== candidate.commercial.valid_until) {
    rows.push({
      key: "valid_until",
      label: "Valid until",
      beforeText: beforeValid,
      afterText: candidate.commercial.valid_until,
    });
  }

  if ((base?.commercial.notes ?? "") !== candidate.commercial.notes) {
    rows.push({
      key: "notes",
      label: "Notes",
      beforeText: base ? "No" : null,
      afterText: "Changed",
    });
  }

  rows.push(...scheduleRows(scheduleOf(base), scheduleOf(candidate)));

  const before = base?.totals;
  const after = candidate.totals;
  push(
    moneyRow(
      "subtotal",
      "Subtotal",
      before?.subtotal_minor ?? 0,
      after.subtotal_minor,
    ),
  );
  push(moneyRow("tax", "Tax", before?.tax_minor ?? 0, after.tax_minor));
  push(
    moneyRow(
      "charges_net",
      "Charges",
      before?.charge_net_minor ?? 0,
      after.charge_net_minor,
    ),
  );
  push(moneyRow("total", "Total", before?.total_minor ?? 0, after.total_minor));
  return rows;
}
