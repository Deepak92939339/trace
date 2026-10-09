import type { CanonicalQuoteSnapshotV2 } from "../../lib/quotes/canonical-snapshot.ts";
import type { PaymentScheduleEntryV2 } from "../../lib/quotes/payment-schedule.ts";
import { canonicalV1Vectors } from "./canonical-v1-vectors.ts";

export type CanonicalV2Vector = {
  name: string;
  /** The v1 vector this one extends: same quote, plus a sealed schedule. */
  baseIndex: number;
  snapshot: CanonicalQuoteSnapshotV2;
  expectedSnapshotHash: string;
};

function v2(
  baseIndex: number,
  schedule: PaymentScheduleEntryV2[],
): CanonicalQuoteSnapshotV2 {
  const base = canonicalV1Vectors[baseIndex]!.snapshot;
  return { ...base, format_version: 2, payment_schedule: schedule };
}

export const canonicalV2Vectors: CanonicalV2Vector[] = [
  {
    // total 25214 at 5000/3000/2000 -> 12607 / 7564 / 5043
    name: "usd-three-milestones-last-absorbs-remainder",
    baseIndex: 0,
    snapshot: v2(0, [
      {
        position: 1,
        label: "Deposit",
        basis_points: 5000,
        trigger: "on_acceptance",
        due_date: null,
        amount_minor: 12607,
      },
      {
        position: 2,
        label: "On delivery",
        basis_points: 3000,
        trigger: "on_delivery",
        due_date: null,
        amount_minor: 7564,
      },
      {
        position: 3,
        label: "Final instalment",
        basis_points: 2000,
        trigger: "on_date",
        due_date: "2027-03-31",
        amount_minor: 5043,
      },
    ]),
    expectedSnapshotHash:
      "e78f1b4fb0f86ab239d76aad08b0762f33fe86aac1307d1887a83830340558f1",
  },
  {
    // total 500 (JPY, exponent 0), one milestone carries the whole total
    name: "jpy-single-milestone",
    baseIndex: 1,
    snapshot: v2(1, [
      {
        position: 1,
        label: "On completion",
        basis_points: 10000,
        trigger: "on_completion",
        due_date: null,
        amount_minor: 500,
      },
    ]),
    expectedSnapshotHash:
      "6c654634632c810ed40c23c2372d2d5913d3d3ce62931d5397f7f4f32ce2c861",
  },
  {
    // total 318022 at 6000/4000; entries listed out of order and a combining
    // accent in the label, so canonical ordering and NFC both matter
    name: "inr-unicode-label-entries-out-of-order",
    baseIndex: 3,
    snapshot: v2(3, [
      {
        position: 2,
        label: "Livraison",
        basis_points: 4000,
        trigger: "on_date",
        due_date: "2027-03-31",
        amount_minor: 127209,
      },
      {
        position: 1,
        label: "Café deposit",
        basis_points: 6000,
        trigger: "on_acceptance",
        due_date: null,
        amount_minor: 190813,
      },
    ]),
    expectedSnapshotHash:
      "417abe8bfbc29a9ba9a40f1921b2d8ebfc7e16200323a73aeb20fb15e9da67eb",
  },
];
