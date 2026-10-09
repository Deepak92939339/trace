import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  ensureQuotePdf,
  QuotePdfError,
  sha256Hex,
  WAIT_FOR_OTHER_RENDER_MS,
  type ClaimResult,
  type EnsurePdfDeps,
  type RegisteredPdf,
} from "../../lib/quote-pdf/ensure-pdf";
import { quotePdfStoragePath } from "../../lib/quote-pdf/path";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REVISION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const PATH = quotePdfStoragePath(ORG, REVISION);
const USER = "11111111-1111-4111-8111-111111111111";

const pdf = (text: string) =>
  new TextEncoder().encode(`%PDF-1.4\n${text}\n%%EOF`);

function row(bytes: Uint8Array): RegisteredPdf {
  return {
    revisionId: REVISION,
    storagePath: PATH,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
    snapshotHash: "a".repeat(64),
    generatedAt: "2026-10-01T00:00:00.000Z",
  };
}

/** An in-memory stand-in for the register, the bucket and the database's claim rules. */
function world(options: { canRender?: () => Promise<Uint8Array> } = {}) {
  const state = {
    registered: null as RegisteredPdf | null,
    object: null as Uint8Array | null,
    leased: false,
    attempts: [] as Array<{ id: string; ok: boolean | null }>,
    renders: 0,
    claims: 0,
    clock: 0,
    claimOverride: null as ClaimResult | null,
  };
  const deps: EnsurePdfDeps = {
    readRegistered: async () => state.registered,
    claim: async () => {
      state.claims += 1;
      if (state.claimOverride) return state.claimOverride;
      if (state.registered) return { status: "exists" };
      if (state.leased) return { status: "in_progress" };
      state.leased = true;
      const id = `attempt-${state.attempts.length + 1}`;
      state.attempts.push({ id, ok: null });
      return { status: "render", attemptId: id };
    },
    finish: async (attemptId, ok) => {
      state.leased = false;
      state.attempts.find((attempt) => attempt.id === attemptId)!.ok = ok;
    },
    readObject: async () => state.object,
    storeObject: async (_path, bytes) => {
      if (state.object) return "exists";
      state.object = bytes;
      return "stored";
    },
    registerPdf: async (input) => {
      if (state.registered) return state.registered;
      expect(input.path).toBe(PATH);
      expect(input.revisionId).toBe(REVISION);
      expect(input.byteLength).toBe(state.object!.byteLength);
      state.registered = { ...row(state.object!), sha256: input.sha256 };
      return state.registered;
    },
    render:
      options.canRender ??
      (async () => {
        state.renders += 1;
        await Promise.resolve();
        return pdf(`render ${state.renders}`);
      }),
    sleep: async (milliseconds) => {
      state.clock += milliseconds;
      await Promise.resolve();
    },
    now: () => state.clock,
  };
  return { state, deps };
}

const generator = {
  organizationId: ORG,
  revisionId: REVISION,
  userId: USER,
  canGenerate: true,
};

describe("ensureQuotePdf", () => {
  it("serves a registered PDF without claiming, rendering or storing anything", async () => {
    const { state, deps } = world();
    state.registered = row(pdf("existing"));
    const result = await ensureQuotePdf(generator, deps);
    expect(result).toBe(state.registered);
    expect(state.claims).toBe(0);
    expect(state.renders).toBe(0);
  });

  it("lets a registered PDF be served to a holder of read-only access", async () => {
    const { state, deps } = world();
    state.registered = row(pdf("existing"));
    await expect(
      ensureQuotePdf({ ...generator, canGenerate: false }, deps),
    ).resolves.toBe(state.registered);
  });

  it("refuses to render for a caller without quote.print, with a clear 403 and no side effects", async () => {
    const { state, deps } = world();
    const failure = await ensureQuotePdf(
      { ...generator, canGenerate: false },
      deps,
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(QuotePdfError);
    const error = failure as QuotePdfError;
    expect(error.status).toBe(403);
    expect(error.code).toBe("pdf_generation_forbidden");
    expect(error.message).toMatch(/quote\.print/);
    expect(state.claims).toBe(0);
    expect(state.renders).toBe(0);
    expect(state.object).toBeNull();
  });

  it("renders once, stores without overwriting, and registers the hash of the stored bytes", async () => {
    const { state, deps } = world();
    const result = await ensureQuotePdf(generator, deps);
    expect(state.renders).toBe(1);
    expect(state.object).not.toBeNull();
    expect(result.sha256).toBe(sha256Hex(state.object!));
    expect(result.byteLength).toBe(state.object!.byteLength);
    expect(state.attempts).toEqual([{ id: "attempt-1", ok: true }]);
  });

  it("a later request returns the same file and never renders again", async () => {
    const { state, deps } = world();
    const first = await ensureQuotePdf(generator, deps);
    const second = await ensureQuotePdf(generator, deps);
    expect(second.sha256).toBe(first.sha256);
    expect(state.renders).toBe(1);
  });

  it("five concurrent first requests render once and all receive the same file", async () => {
    const { state, deps } = world();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => ensureQuotePdf(generator, deps)),
    );
    expect(state.renders).toBe(1);
    expect(state.attempts).toHaveLength(1);
    expect(new Set(results.map((result) => result.sha256)).size).toBe(1);
  });

  it("a waiter gives up with a retryable 503 when the other render never finishes", async () => {
    const { state, deps } = world();
    state.leased = true;
    const failure = (await ensureQuotePdf(generator, deps).catch(
      (error: unknown) => error,
    )) as QuotePdfError;
    expect(failure.status).toBe(503);
    expect(failure.code).toBe("pdf_generation_in_progress");
    expect(failure.retryAfterSeconds).toBeGreaterThan(0);
    expect(state.clock).toBeGreaterThanOrEqual(WAIT_FOR_OTHER_RENDER_MS);
    expect(state.renders).toBe(0);
  });

  it("adopts an orphaned object instead of rendering a second, different file", async () => {
    const { state, deps } = world();
    const orphan = pdf("stored before the earlier process died");
    state.object = orphan;
    const result = await ensureQuotePdf(generator, deps);
    expect(state.renders).toBe(0);
    expect(result.sha256).toBe(sha256Hex(orphan));
    expect(result.byteLength).toBe(orphan.byteLength);
  });

  it("when the upload loses a race, registers the winner's bytes, not its own render", async () => {
    const { state, deps } = world();
    const winner = pdf("the winner");
    const readObject = vi
      .fn<EnsurePdfDeps["readObject"]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(winner);
    deps.readObject = readObject;
    deps.storeObject = async () => "exists";
    deps.registerPdf = async (input) => {
      expect(input.sha256).toBe(sha256Hex(winner));
      expect(input.byteLength).toBe(winner.byteLength);
      return { ...row(winner), sha256: input.sha256 };
    };
    const result = await ensureQuotePdf(generator, deps);
    expect(state.renders).toBe(1);
    expect(result.sha256).toBe(sha256Hex(winner));
  });

  it("reports a render failure as 502, releases the lease as failed, and stores nothing", async () => {
    const { state, deps } = world({
      canRender: async () => {
        throw new Error("browser crashed");
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = (await ensureQuotePdf(generator, deps).catch(
      (error: unknown) => error,
    )) as QuotePdfError;
    expect(failure.status).toBe(502);
    expect(failure.code).toBe("pdf_render_failed");
    expect(failure.message).not.toMatch(/browser crashed/);
    expect(state.attempts).toEqual([{ id: "attempt-1", ok: false }]);
    expect(state.object).toBeNull();
    expect(state.registered).toBeNull();
  });

  it("rejects output that is not a PDF", async () => {
    const { state, deps } = world({
      canRender: async () => new TextEncoder().encode("<html>not a pdf</html>"),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(ensureQuotePdf(generator, deps)).rejects.toMatchObject({
      code: "pdf_render_failed",
    });
    expect(state.object).toBeNull();
  });

  it.each([
    [
      { status: "cooldown", retryAfterSeconds: 17 },
      429,
      "pdf_render_cooldown",
      17,
    ],
    [
      { status: "rate_limited", retryAfterSeconds: 41 },
      429,
      "pdf_rate_limited",
      41,
    ],
    [
      { status: "revision_not_renderable" },
      409,
      "pdf_revision_not_renderable",
      undefined,
    ],
  ] as const)(
    "maps claim %j to HTTP %i",
    async (claim, status, code, retry) => {
      const { state, deps } = world();
      state.claimOverride = claim as ClaimResult;
      const failure = (await ensureQuotePdf(generator, deps).catch(
        (error: unknown) => error,
      )) as QuotePdfError;
      expect(failure.status).toBe(status);
      expect(failure.code).toBe(code);
      expect(failure.retryAfterSeconds).toBe(retry);
      expect(state.renders).toBe(0);
    },
  );

  it("a claim that says exists but cannot be read back is a retryable 503", async () => {
    const { state, deps } = world();
    state.claimOverride = { status: "exists" };
    await expect(ensureQuotePdf(generator, deps)).rejects.toMatchObject({
      status: 503,
      code: "pdf_unavailable",
    });
  });
});
