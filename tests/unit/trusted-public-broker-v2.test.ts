import { describe, expect, it } from "vitest";
import { canonicalV1Vectors } from "../fixtures/canonical-v1-vectors";
import { canonicalV2Vectors } from "../fixtures/canonical-v2-vectors";
import { projectBrokerResult } from "../../supabase/functions/trusted-public-broker/projection";
import { recipientQuoteViewModel } from "../../lib/public-quotes/view-model";
import type { BuyerQuoteProjection } from "../../lib/quotes/commitment-contracts";

const statement =
  "I accept this exact Tender quotation revision and acknowledge that the name and title provided are buyer-asserted.";

function openEnvelope(snapshot: unknown) {
  return {
    status: "ok",
    value: {
      link_id: "10000000-0000-4000-8000-000000000001",
      revision_id: "20000000-0000-4000-8000-000000000001",
      quote_number: "TND-2026-0001",
      revision_number: 1,
      effective_state: "issued",
      snapshot,
      snapshot_hash: "a".repeat(64),
      calculation_fingerprint: "b".repeat(64),
      response_type: null,
      acceptance_allowed: true,
      acceptance_statement_version: 1,
      acceptance_statement: statement,
    },
  };
}

function open(snapshot: unknown) {
  return projectBrokerResult("open", openEnvelope(snapshot));
}

describe("Edge broker open projection: snapshot v1 and v2", () => {
  it.each(canonicalV1Vectors.map((vector, index) => [vector.name, index]))(
    "projects the v1 snapshot %s unchanged",
    (_name, index) => {
      const snapshot = canonicalV1Vectors[index]!.snapshot;
      const result = open(snapshot);
      expect(result.status).toBe("ok");
      expect(
        (result as { value: BuyerQuoteProjection }).value.snapshot,
      ).toEqual(snapshot);
    },
  );

  it.each(canonicalV2Vectors.map((vector, index) => [vector.name, index]))(
    "projects the v2 snapshot %s and it round-trips through transport JSON",
    (_name, index) => {
      const snapshot = canonicalV2Vectors[index]!.snapshot;
      const result = open(snapshot) as {
        status: "ok";
        value: BuyerQuoteProjection;
      };
      expect(result.status).toBe("ok");
      const wire = JSON.parse(JSON.stringify(result)) as typeof result;
      expect(wire.value.snapshot).toEqual(snapshot);
      // The buyer view model consumes the round-tripped projection.
      const view = recipientQuoteViewModel(wire.value);
      expect(view.paymentSchedule).toHaveLength(
        snapshot.payment_schedule.length,
      );
    },
  );

  it("keeps the v1 path strict: a v1 snapshot cannot carry a schedule", () => {
    const smuggled = {
      ...canonicalV1Vectors[0]!.snapshot,
      payment_schedule: canonicalV2Vectors[0]!.snapshot.payment_schedule,
    };
    expect(() => open(smuggled)).toThrow("payment_schedule is not supported");
  });

  it("rejects a v2 snapshot whose sealed amounts do not match its total", () => {
    const snapshot = structuredClone(canonicalV2Vectors[0]!.snapshot);
    snapshot.payment_schedule[0]!.amount_minor += 1;
    expect(() => open(snapshot)).toThrow("amounts do not match");
  });

  it("rejects a v2 snapshot with no schedule and an unknown version", () => {
    const noSchedule = structuredClone(
      canonicalV2Vectors[0]!.snapshot,
    ) as unknown as Record<string, unknown>;
    delete noSchedule.payment_schedule;
    expect(() => open(noSchedule)).toThrow("payment_schedule is required");
    expect(() =>
      open({ ...canonicalV2Vectors[0]!.snapshot, format_version: 3 }),
    ).toThrow("unsupported format version");
  });

  it("still projects error statuses without a snapshot", () => {
    expect(projectBrokerResult("open", { status: "expired" })).toEqual({
      status: "expired",
    });
  });
});
