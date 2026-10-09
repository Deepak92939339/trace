import { describe, expect, it } from "vitest";
import type {
  CanonicalQuoteSnapshot,
  CanonicalQuoteSnapshotV2,
} from "../../lib/quotes/canonical-snapshot";
import type { PaymentScheduleEntryV2 } from "../../lib/quotes/payment-schedule";
import { diffSnapshots } from "../../lib/quotes/revision-diff";
import { canonicalV1Vectors } from "../fixtures/canonical-v1-vectors";
import { canonicalV2Vectors } from "../fixtures/canonical-v2-vectors";

const v1 = canonicalV1Vectors[0]!.snapshot;
const v2 = canonicalV2Vectors[0]!.snapshot;

function withSchedule(
  edit: (schedule: PaymentScheduleEntryV2[]) => void,
): CanonicalQuoteSnapshotV2 {
  const copy = structuredClone(v2);
  edit(copy.payment_schedule);
  return copy;
}

const scheduleRows = (
  base: CanonicalQuoteSnapshot | null,
  next: CanonicalQuoteSnapshot,
) => diffSnapshots(base, next).filter((row) => row.key.startsWith("payment:"));

describe("diffSnapshots: payment schedule", () => {
  it("shows nothing when the schedule is unchanged", () => {
    expect(diffSnapshots(v2, structuredClone(v2))).toEqual([]);
  });

  it("v1 to v2: every milestone is added (schedule added in a later revision)", () => {
    const rows = scheduleRows(v1, v2);
    expect(rows.map((row) => row.key)).toEqual([
      "payment:1:added",
      "payment:2:added",
      "payment:3:added",
    ]);
    expect(rows[0]).toEqual({
      key: "payment:1:added",
      label: "Payment milestone 1 added",
      beforeText: null,
      afterText: "Deposit, 50.00%, on acceptance",
    });
    expect(rows[2]!.afterText).toBe("Final instalment, 20.00%, on 2027-03-31");
  });

  it("v2 to v1: every milestone is removed", () => {
    const rows = scheduleRows(v2, v1);
    expect(rows.map((row) => row.key)).toEqual([
      "payment:1:removed",
      "payment:2:removed",
      "payment:3:removed",
    ]);
    expect(rows[1]).toMatchObject({
      label: "Payment milestone 2 removed",
      beforeText: "On delivery, 30.00%, on delivery",
      afterText: null,
    });
  });

  it("with no base, a schedule is reported as added", () => {
    expect(scheduleRows(null, v2)).toHaveLength(3);
  });

  it("a milestone removed from the end", () => {
    const next = withSchedule((schedule) => schedule.pop());
    expect(scheduleRows(v2, next).map((row) => row.key)).toEqual([
      "payment:3:removed",
    ]);
  });

  it("a milestone added at the end", () => {
    const next = withSchedule((schedule) =>
      schedule.push({
        position: 4,
        label: "Retention",
        basis_points: 500,
        trigger: "on_completion",
        due_date: null,
        amount_minor: 1,
      }),
    );
    expect(scheduleRows(v2, next).map((row) => row.key)).toEqual([
      "payment:4:added",
    ]);
  });

  it("a changed label", () => {
    const next = withSchedule((schedule) => (schedule[0]!.label = "Advance"));
    expect(scheduleRows(v2, next)).toEqual([
      {
        key: "payment:1:label",
        label: "Payment milestone 1 label",
        beforeText: "Deposit",
        afterText: "Advance",
      },
    ]);
  });

  it("a changed share", () => {
    const next = withSchedule((schedule) => (schedule[1]!.basis_points = 3333));
    expect(scheduleRows(v2, next)).toEqual([
      {
        key: "payment:2:basis_points",
        label: "Payment milestone 2 share",
        beforeText: "30.00%",
        afterText: "33.33%",
      },
    ]);
  });

  it("a changed trigger", () => {
    const next = withSchedule(
      (schedule) => (schedule[1]!.trigger = "on_completion"),
    );
    expect(scheduleRows(v2, next)).toEqual([
      {
        key: "payment:2:trigger",
        label: "Payment milestone 2 timing",
        beforeText: "On delivery",
        afterText: "On completion",
      },
    ]);
  });

  it("a changed due date", () => {
    const next = withSchedule(
      (schedule) => (schedule[2]!.due_date = "2027-06-30"),
    );
    expect(scheduleRows(v2, next)).toEqual([
      {
        key: "payment:3:due_date",
        label: "Payment milestone 3 date",
        beforeText: "2027-03-31",
        afterText: "2027-06-30",
      },
    ]);
  });

  it("reports each changed field of one milestone separately", () => {
    const next = withSchedule((schedule) => {
      schedule[2]!.trigger = "on_delivery";
      schedule[2]!.due_date = null;
    });
    expect(scheduleRows(v2, next).map((row) => row.key)).toEqual([
      "payment:3:trigger",
      "payment:3:due_date",
    ]);
  });

  it("places schedule rows after notes and before the totals rows", () => {
    const next = structuredClone(v2);
    next.commercial.notes = "changed";
    next.payment_schedule[0]!.label = "Advance";
    next.totals = {
      ...next.totals,
      subtotal_minor: next.totals.subtotal_minor + 1,
    };
    const keys = diffSnapshots(v2, next).map((row) => row.key);
    expect(keys).toEqual(["notes", "payment:1:label", "subtotal"]);
  });

  it("uses text rows only: no money fields on schedule rows", () => {
    for (const row of scheduleRows(v1, v2)) {
      expect(row.beforeMinor).toBeUndefined();
      expect(row.afterMinor).toBeUndefined();
      expect(row.deltaMinor).toBeUndefined();
    }
  });
});
