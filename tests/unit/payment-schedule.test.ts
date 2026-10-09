import { describe, expect, it } from "vitest";
import {
  allocateMilestoneAmounts,
  basisPointsText,
  PAYMENT_STATUS_WORD,
  presentPaymentSchedule,
  validatePaymentMilestones,
  type PaymentMilestoneInput,
  type PaymentScheduleEntryV2,
} from "../../lib/quotes/payment-schedule";

const milestone = (
  over: Partial<PaymentMilestoneInput> = {},
): PaymentMilestoneInput => ({
  label: "Deposit",
  basis_points: 5000,
  trigger: "on_acceptance",
  due_date: null,
  ...over,
});

describe("allocateMilestoneAmounts", () => {
  it("splits 832572 at 5000/3000/2000 into 416286 / 249772 / 166514", () => {
    expect(allocateMilestoneAmounts(832_572, [5000, 3000, 2000])).toEqual([
      416_286, 249_772, 166_514,
    ]);
  });

  it("lets the last milestone absorb the remainder so amounts sum to the total", () => {
    const amounts = allocateMilestoneAmounts(100, [3333, 3333, 3334]);
    expect(amounts).toEqual([33, 33, 34]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("rounds half up for every milestone but the last", () => {
    expect(allocateMilestoneAmounts(1, [5000, 5000])).toEqual([1, 0]);
    expect(allocateMilestoneAmounts(3, [5000, 5000])).toEqual([2, 1]);
  });

  it("gives one milestone the whole total", () => {
    expect(allocateMilestoneAmounts(1_321_600, [10_000])).toEqual([1_321_600]);
  });

  it("sums exactly for large totals without losing precision", () => {
    const total = Number.MAX_SAFE_INTEGER;
    const amounts = allocateMilestoneAmounts(total, [3333, 3333, 3334]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it.each([
    ["a zero total", 0, [10_000]],
    ["a negative total", -1, [10_000]],
    ["a fractional total", 10.5, [10_000]],
    ["basis points that do not total 10000", 100, [5000, 4000]],
    ["a zero-basis-point milestone", 100, [0, 10_000]],
    ["no milestones", 100, []],
    ["more than 12 milestones", 1000, Array.from({ length: 13 }, () => 1)],
    ["a negative last amount", 2, [2500, 2500, 2500, 2500]],
  ])("rejects %s", (_name, total, bps) => {
    expect(() => allocateMilestoneAmounts(total, bps)).toThrow(RangeError);
  });
});

describe("validatePaymentMilestones (edit time)", () => {
  const issue = "2026-10-01";

  it("accepts a valid draft schedule, including a partial total", () => {
    expect(validatePaymentMilestones([milestone()], issue)).toBeNull();
    expect(validatePaymentMilestones([], issue)).toBeNull();
  });

  it.each([
    "Deposit paid",
    "PAID in full",
    "Payment Received",
    "pending approval",
    "Pending-approval",
    "Outstanding balance",
    "Overdue fee",
    "Settled on delivery",
  ])("rejects the status word in %j", (label) => {
    expect(validatePaymentMilestones([milestone({ label })], issue)).toMatch(
      /payment status/,
    );
    expect(PAYMENT_STATUS_WORD.test(label)).toBe(true);
  });

  it.each(["Prepaid deposit", "Unpaid remainder terms", "Repending"])(
    "allows %j because only whole words match",
    (label) => {
      expect(
        validatePaymentMilestones([milestone({ label })], issue),
      ).toBeNull();
    },
  );

  it("enforces label length", () => {
    expect(
      validatePaymentMilestones([milestone({ label: "  " })], issue),
    ).toMatch(/1 to 120/);
    expect(
      validatePaymentMilestones([milestone({ label: "x".repeat(121) })], issue),
    ).toMatch(/1 to 120/);
    expect(
      validatePaymentMilestones([milestone({ label: "x".repeat(120) })], issue),
    ).toBeNull();
  });

  it("enforces at most 12 milestones and at most 10000 basis points", () => {
    const thirteen = Array.from({ length: 13 }, () =>
      milestone({ basis_points: 100 }),
    );
    expect(validatePaymentMilestones(thirteen, issue)).toMatch(/at most 12/);
    expect(
      validatePaymentMilestones(
        [milestone({ basis_points: 6000 }), milestone({ basis_points: 5000 })],
        issue,
      ),
    ).toMatch(/more than 10000/);
  });

  it("requires a date for on_date and forbids one otherwise", () => {
    expect(
      validatePaymentMilestones([milestone({ trigger: "on_date" })], issue),
    ).toMatch(/date is required/);
    expect(
      validatePaymentMilestones(
        [milestone({ trigger: "on_date", due_date: "2026-13-40" })],
        issue,
      ),
    ).toMatch(/date is required/);
    expect(
      validatePaymentMilestones([milestone({ due_date: "2026-11-01" })], issue),
    ).toMatch(/only a dated milestone/);
  });

  it("allows a date on the issue date and rejects an earlier one", () => {
    expect(
      validatePaymentMilestones(
        [milestone({ trigger: "on_date", due_date: issue })],
        issue,
      ),
    ).toBeNull();
    expect(
      validatePaymentMilestones(
        [milestone({ trigger: "on_date", due_date: "2026-09-30" })],
        issue,
      ),
    ).toMatch(/before the quotation issue date/);
  });
});

describe("presentPaymentSchedule", () => {
  const entries: PaymentScheduleEntryV2[] = [
    {
      position: 2,
      label: "Final instalment",
      basis_points: 2000,
      trigger: "on_date",
      due_date: "2027-03-31",
      amount_minor: 5043,
    },
    {
      position: 1,
      label: "Deposit",
      basis_points: 8000,
      trigger: "on_acceptance",
      due_date: null,
      amount_minor: 20_171,
    },
  ];

  it("orders by position and formats sealed amounts without recomputing them", () => {
    const rows = presentPaymentSchedule(entries, (minor) => `$${minor}`);
    expect(rows.map((row) => row.position)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({
      percentDisplay: "80.00%",
      amountDisplay: "$20171",
      dueText: "Due on acceptance",
    });
    expect(rows[1]).toMatchObject({
      percentDisplay: "20.00%",
      amountDisplay: "$5043",
      dueText: "Due on 2027-03-31",
    });
  });

  it("formats basis points with integer math", () => {
    expect(basisPointsText(3333)).toBe("33.33%");
    expect(basisPointsText(5)).toBe("0.05%");
    expect(basisPointsText(10_000)).toBe("100.00%");
  });
});
