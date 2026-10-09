/**
 * Payment milestone schedule: when payment is due. Pure and dependency-free so
 * the Edge broker, the app and the parity script all load the same code.
 *
 * Amounts are shares of the quote total (tax and charges included). Every
 * milestone except the last is round-half-up(total x basis_points / 10000)
 * (the kernel's rounding rule); the last milestone absorbs the remainder so the
 * amounts sum to the total exactly. Mirrors public.quote_milestone_amounts.
 */
export const PAYMENT_TRIGGERS = [
  "on_acceptance",
  "on_delivery",
  "on_completion",
  "on_date",
] as const;
export type PaymentTrigger = (typeof PAYMENT_TRIGGERS)[number];

export const MAX_PAYMENT_MILESTONES = 12;
export const MAX_PAYMENT_LABEL_LENGTH = 120;

/** A milestone as authored while drafting. */
export type PaymentMilestoneInput = {
  label: string;
  basis_points: number;
  trigger: PaymentTrigger;
  due_date: string | null;
};

/** A milestone as sealed in a v2 snapshot. */
export type PaymentScheduleEntryV2 = PaymentMilestoneInput & {
  position: number;
  amount_minor: number;
};

/**
 * Labels describe when payment is due; they must not claim a payment state.
 * Whole-word, case-insensitive. The database applies the same rule at edit time.
 */
export const PAYMENT_STATUS_WORD =
  /\b(paid|received|pending|outstanding|overdue|settled)\b/i;

const CONTROL = /[\u0000-\u001f\u007f]/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const BPS_TOTAL = 10_000n;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
  );
}

/**
 * Edit-time validation for a draft schedule. Returns an error message, or null
 * when valid. A draft may total less than 10000 bps; the total must be exactly
 * 10000 at submission (see allocateMilestoneAmounts).
 */
export function validatePaymentMilestones(
  milestones: readonly PaymentMilestoneInput[],
  issueDate: string,
): string | null {
  if (milestones.length > MAX_PAYMENT_MILESTONES)
    return `A schedule has at most ${MAX_PAYMENT_MILESTONES} milestones.`;
  let total = 0;
  for (const [index, milestone] of milestones.entries()) {
    const at = `Milestone ${index + 1}`;
    const label = milestone.label.trim();
    if (label.length < 1 || label.length > MAX_PAYMENT_LABEL_LENGTH)
      return `${at}: the label must be 1 to ${MAX_PAYMENT_LABEL_LENGTH} characters.`;
    if (CONTROL.test(label)) return `${at}: the label has control characters.`;
    if (PAYMENT_STATUS_WORD.test(label))
      return `${at}: describe when payment is due, not a payment status.`;
    if (
      !Number.isSafeInteger(milestone.basis_points) ||
      milestone.basis_points < 1 ||
      milestone.basis_points > 10_000
    )
      return `${at}: basis points must be a whole number from 1 to 10000.`;
    total += milestone.basis_points;
    if (!PAYMENT_TRIGGERS.includes(milestone.trigger))
      return `${at}: unknown trigger.`;
    if (milestone.trigger === "on_date") {
      if (milestone.due_date === null || !isValidIsoDate(milestone.due_date))
        return `${at}: a date is required for a dated milestone.`;
      if (milestone.due_date < issueDate)
        return `${at}: the date cannot be before the quotation issue date.`;
    } else if (milestone.due_date !== null) {
      return `${at}: only a dated milestone has a date.`;
    }
  }
  if (total > 10_000) return "Basis points add up to more than 10000.";
  return null;
}

/**
 * Amounts for each milestone in position order. Throws RangeError (the
 * database raises PAYMENT_SCHEDULE_INVALID) when the schedule cannot be sealed:
 * total not positive, no milestones or more than 12, basis points not whole
 * numbers from 1 to 10000, basis points not summing to exactly 10000, or a
 * rounding outcome that would make the last amount negative.
 */
export function allocateMilestoneAmounts(
  totalMinor: number,
  basisPoints: readonly number[],
): number[] {
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0)
    throw new RangeError("A payment schedule needs a positive quote total.");
  if (basisPoints.length < 1 || basisPoints.length > MAX_PAYMENT_MILESTONES)
    throw new RangeError("A payment schedule has 1 to 12 milestones.");
  let sum = 0n;
  for (const bps of basisPoints) {
    if (!Number.isSafeInteger(bps) || bps < 1 || bps > 10_000)
      throw new RangeError("Milestone basis points must be 1 to 10000.");
    sum += BigInt(bps);
  }
  if (sum !== BPS_TOTAL)
    throw new RangeError("Milestone basis points must add up to 10000.");
  const total = BigInt(totalMinor);
  const amounts: bigint[] = [];
  let allocated = 0n;
  for (const bps of basisPoints.slice(0, -1)) {
    const amount = (total * BigInt(bps) + BPS_TOTAL / 2n) / BPS_TOTAL;
    amounts.push(amount);
    allocated += amount;
  }
  const last = total - allocated;
  if (last < 0n)
    throw new RangeError("Rounding would make the last milestone negative.");
  amounts.push(last);
  return amounts.map(Number);
}

/** Buyer- and print-facing row: when payment is due, never a payment status. */
export type PaymentScheduleRow = {
  position: number;
  label: string;
  percentDisplay: string;
  amountDisplay: string;
  trigger: PaymentTrigger;
  dueText: string;
  dueDate: string | null;
};

const DUE_TEXT: Record<Exclude<PaymentTrigger, "on_date">, string> = {
  on_acceptance: "Due on acceptance",
  on_delivery: "Due on delivery",
  on_completion: "Due on completion",
};

export function basisPointsText(basisPoints: number): string {
  const whole = Math.trunc(basisPoints / 100);
  const fraction = String(basisPoints % 100).padStart(2, "0");
  return `${whole}.${fraction}%`;
}

/**
 * Presentation of a sealed schedule. Amounts come from the sealed snapshot and
 * are only formatted here, never recomputed.
 */
export function presentPaymentSchedule(
  entries: readonly PaymentScheduleEntryV2[],
  money: (minor: number) => string,
): PaymentScheduleRow[] {
  return [...entries]
    .sort((left, right) => left.position - right.position)
    .map((entry) => ({
      position: entry.position,
      label: entry.label,
      percentDisplay: basisPointsText(entry.basis_points),
      amountDisplay: money(entry.amount_minor),
      trigger: entry.trigger,
      dueText:
        entry.trigger === "on_date" && entry.due_date !== null
          ? `Due on ${entry.due_date}`
          : DUE_TEXT[entry.trigger as Exclude<PaymentTrigger, "on_date">],
      dueDate: entry.due_date,
    }));
}
