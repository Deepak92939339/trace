import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalizeQuoteSnapshot,
  canonicalizeQuoteSnapshotV1,
} from "../../lib/quotes/canonical-snapshot";
import { canonicalV1Vectors } from "../fixtures/canonical-v1-vectors";
import { canonicalV2Vectors } from "../fixtures/canonical-v2-vectors";

const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

describe("canonical snapshot v2 (payment schedule)", () => {
  for (const vector of canonicalV2Vectors) {
    it(`${vector.name}: hash is pinned`, () => {
      const bytes = canonicalizeQuoteSnapshot(vector.snapshot);
      expect(hash(bytes)).toBe(vector.expectedSnapshotHash);
      expect(bytes).toContain('"format_version":2');
      expect(bytes).toContain('"payment_schedule":[');
    });
  }

  it("v2 differs from its v1 base only by the version number and the schedule", () => {
    const vector = canonicalV2Vectors[0]!;
    const v1 = canonicalV1Vectors[vector.baseIndex]!.snapshot;
    const v2Bytes = canonicalizeQuoteSnapshot(vector.snapshot);
    const parsed = JSON.parse(v2Bytes) as Record<string, unknown>;
    delete parsed.payment_schedule;
    parsed.format_version = 1;
    expect(JSON.stringify(sortKeys(parsed))).toBe(
      canonicalizeQuoteSnapshotV1(v1),
    );
  });

  it("is independent of the order the schedule entries arrive in", () => {
    const vector = canonicalV2Vectors[2]!; // fixture lists position 2 before 1
    const reordered = {
      ...vector.snapshot,
      payment_schedule: [...vector.snapshot.payment_schedule].sort(
        (a, b) => a.position - b.position,
      ),
    };
    expect(canonicalizeQuoteSnapshot(reordered)).toBe(
      canonicalizeQuoteSnapshot(vector.snapshot),
    );
  });

  it("normalizes labels to NFC in the canonical bytes", () => {
    const bytes = canonicalizeQuoteSnapshot(canonicalV2Vectors[2]!.snapshot);
    expect(bytes).toContain("Café deposit");
    expect(bytes).not.toContain("é");
  });
});

describe("version dispatch", () => {
  it("sends format 1 through the unchanged v1 path", () => {
    for (const vector of canonicalV1Vectors) {
      expect(canonicalizeQuoteSnapshot(vector.snapshot)).toBe(
        canonicalizeQuoteSnapshotV1(vector.snapshot),
      );
      expect(hash(canonicalizeQuoteSnapshot(vector.snapshot))).toBe(
        vector.expectedSnapshotHash,
      );
    }
  });

  it("keeps the v1 canonicalizer v1-only", () => {
    expect(() =>
      canonicalizeQuoteSnapshotV1(canonicalV2Vectors[0]!.snapshot),
    ).toThrow(/payment_schedule is not supported|unsupported format version/);
  });

  it("does not let a v1 document carry a schedule", () => {
    const smuggled = {
      ...canonicalV1Vectors[0]!.snapshot,
      payment_schedule: canonicalV2Vectors[0]!.snapshot.payment_schedule,
    };
    expect(() => canonicalizeQuoteSnapshot(smuggled)).toThrow(
      "payment_schedule is not supported",
    );
  });

  it.each([0, 3, undefined, "2", null])(
    "rejects format_version %j",
    (declared) => {
      expect(() =>
        canonicalizeQuoteSnapshot({
          ...canonicalV2Vectors[0]!.snapshot,
          format_version: declared,
        }),
      ).toThrow("unsupported format version");
    },
  );

  it.each([null, "x", 7, []])("rejects a non-object snapshot %j", (value) => {
    expect(() => canonicalizeQuoteSnapshot(value)).toThrow();
  });
});

describe("v2 schedule validation", () => {
  const base = () => structuredClone(canonicalV2Vectors[0]!.snapshot);
  const mutate = (change: (value: ReturnType<typeof base>) => void) => {
    const value = base();
    change(value);
    return () => canonicalizeQuoteSnapshot(value);
  };

  it("rejects a v2 document without a schedule", () => {
    const value = base() as unknown as Record<string, unknown>;
    delete value.payment_schedule;
    expect(() => canonicalizeQuoteSnapshot(value)).toThrow(
      "snapshot.payment_schedule is required",
    );
  });

  it("rejects an empty schedule and more than 12 milestones", () => {
    expect(mutate((v) => (v.payment_schedule = []))).toThrow("1 to 12");
    expect(
      mutate((v) => {
        v.payment_schedule = Array.from({ length: 13 }, (_, index) => ({
          position: index + 1,
          label: "x",
          basis_points: 1,
          trigger: "on_acceptance" as const,
          due_date: null,
          amount_minor: 1,
        }));
      }),
    ).toThrow("1 to 12");
  });

  it("rejects amounts that do not match the quote total", () => {
    expect(mutate((v) => (v.payment_schedule[0]!.amount_minor += 1))).toThrow(
      "amounts do not match",
    );
  });

  it("rejects basis points that do not total 10000", () => {
    expect(mutate((v) => (v.payment_schedule[0]!.basis_points = 4000))).toThrow(
      "add up to 10000",
    );
  });

  it("rejects position gaps and duplicates", () => {
    expect(mutate((v) => (v.payment_schedule[2]!.position = 5))).toThrow(
      "without gaps",
    );
    expect(mutate((v) => (v.payment_schedule[1]!.position = 1))).toThrow(
      "without gaps",
    );
  });

  it("rejects an unknown trigger and a date/trigger mismatch", () => {
    expect(
      mutate((v) => {
        (v.payment_schedule[0] as Record<string, unknown>).trigger = "on_x";
      }),
    ).toThrow("unsupported value");
    expect(
      mutate((v) => (v.payment_schedule[0]!.due_date = "2027-01-01")),
    ).toThrow("required for and only for on_date");
    expect(mutate((v) => (v.payment_schedule[2]!.due_date = null))).toThrow(
      "required for and only for on_date",
    );
    expect(
      mutate((v) => (v.payment_schedule[2]!.due_date = "31/03/2027")),
    ).toThrow("ISO date");
  });

  it("rejects unknown keys in a schedule entry and bad labels", () => {
    expect(
      mutate((v) => {
        (v.payment_schedule[0] as Record<string, unknown>).paid = true;
      }),
    ).toThrow("is not supported");
    expect(mutate((v) => (v.payment_schedule[0]!.label = ""))).toThrow(
      "1 to 120",
    );
    expect(
      mutate((v) => (v.payment_schedule[0]!.label = "x".repeat(121))),
    ).toThrow("1 to 120");
  });
});

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, sortKeys(entry)]),
    );
  }
  return value;
}
