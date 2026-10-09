import { createHash } from "node:crypto";
import { QUOTE_PDF_MAX_BYTES, quotePdfStoragePath } from "./path";

/**
 * "Give me the one PDF for this issued revision": serve the registered file if there is one,
 * otherwise (and only for a caller allowed to generate) render it exactly once, store it
 * without overwriting, register it, and return the registered row. Dependencies are injected
 * so the state machine can be tested without a browser or a database; the real wiring lives in
 * request-handler.ts and privileged-writer.ts.
 */
export type RegisteredPdf = {
  revisionId: string;
  storagePath: string;
  sha256: string;
  byteLength: number;
  snapshotHash: string;
  generatedAt: string;
};

export type ClaimResult =
  | { status: "exists" | "in_progress" | "revision_not_renderable" }
  | { status: "render"; attemptId: string }
  | { status: "cooldown" | "rate_limited"; retryAfterSeconds: number };

export type StoreOutcome = "stored" | "exists";

export type EnsurePdfDeps = {
  /** Reads the register through the signed-in user's own session (RLS applies). */
  readRegistered(revisionId: string): Promise<RegisteredPdf | null>;
  claim(userId: string, revisionId: string): Promise<ClaimResult>;
  finish(attemptId: string, succeeded: boolean): Promise<void>;
  readObject(path: string): Promise<Uint8Array | null>;
  storeObject(path: string, bytes: Uint8Array): Promise<StoreOutcome>;
  registerPdf(input: {
    revisionId: string;
    sha256: string;
    byteLength: number;
    path: string;
  }): Promise<RegisteredPdf>;
  /** Builds the document from the sealed snapshot and renders it. */
  render(): Promise<Uint8Array>;
  sleep(milliseconds: number): Promise<void>;
  now(): number;
};

export type QuotePdfErrorCode =
  | "pdf_generation_forbidden"
  | "pdf_generation_not_configured"
  | "pdf_rate_limited"
  | "pdf_render_cooldown"
  | "pdf_generation_in_progress"
  | "pdf_revision_not_renderable"
  | "pdf_render_failed"
  | "pdf_unavailable";

export class QuotePdfError extends Error {
  constructor(
    readonly status: number,
    readonly code: QuotePdfErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "QuotePdfError";
  }
}

/** How long a request that is waiting on another render keeps polling before giving up. */
export const WAIT_FOR_OTHER_RENDER_MS = 40_000;
export const WAIT_POLL_MS = 400;

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function looksLikePdf(bytes: Uint8Array) {
  return (
    bytes.byteLength > 8 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export async function ensureQuotePdf(
  input: {
    organizationId: string;
    revisionId: string;
    userId: string;
    /** quote.print: only these callers may cause a render. */
    canGenerate: boolean;
  },
  deps: EnsurePdfDeps,
): Promise<RegisteredPdf> {
  const path = quotePdfStoragePath(input.organizationId, input.revisionId);

  const existing = await deps.readRegistered(input.revisionId);
  if (existing) return existing;
  if (!input.canGenerate)
    throw new QuotePdfError(
      403,
      "pdf_generation_forbidden",
      "This quotation revision has no PDF yet, and generating one needs the print permission (quote.print). Ask someone who can print quotations to open it once.",
    );

  const deadline = deps.now() + WAIT_FOR_OTHER_RENDER_MS;
  for (;;) {
    const claim = await deps.claim(input.userId, input.revisionId);
    switch (claim.status) {
      case "exists": {
        const row = await deps.readRegistered(input.revisionId);
        if (row) return row;
        throw new QuotePdfError(
          503,
          "pdf_unavailable",
          "The PDF is registered but could not be read. Try again shortly.",
          2,
        );
      }
      case "in_progress": {
        if (deps.now() >= deadline)
          throw new QuotePdfError(
            503,
            "pdf_generation_in_progress",
            "The PDF is still being generated. Try again in a few seconds.",
            5,
          );
        await deps.sleep(WAIT_POLL_MS);
        const row = await deps.readRegistered(input.revisionId);
        if (row) return row;
        continue;
      }
      case "cooldown":
        throw new QuotePdfError(
          429,
          "pdf_render_cooldown",
          `The last attempt to generate this PDF failed. Try again in ${claim.retryAfterSeconds} seconds.`,
          claim.retryAfterSeconds,
        );
      case "rate_limited":
        throw new QuotePdfError(
          429,
          "pdf_rate_limited",
          `You have started the maximum of 5 PDF generations in a minute. Try again in ${claim.retryAfterSeconds} seconds.`,
          claim.retryAfterSeconds,
        );
      case "revision_not_renderable":
        throw new QuotePdfError(
          409,
          "pdf_revision_not_renderable",
          "Only an issued, sealed quotation revision has a PDF.",
        );
      case "render":
        return renderAndRegister(claim.attemptId);
    }
  }

  async function renderAndRegister(attemptId: string): Promise<RegisteredPdf> {
    let succeeded = false;
    try {
      // An object without a register row means an earlier render stored the file and stopped
      // before registering. Adopt exactly those bytes; never produce a second, different file.
      let bytes = await deps.readObject(path);
      if (!bytes) {
        bytes = await deps.render();
        if (!looksLikePdf(bytes) || bytes.byteLength > QUOTE_PDF_MAX_BYTES)
          throw new Error("The renderer did not return a usable PDF.");
        const outcome = await deps.storeObject(path, bytes);
        if (outcome === "exists") {
          const winner = await deps.readObject(path);
          if (!winner) throw new Error("A stored PDF vanished while adopting.");
          bytes = winner;
        }
      }
      const registered = await deps.registerPdf({
        revisionId: input.revisionId,
        sha256: sha256Hex(bytes),
        byteLength: bytes.byteLength,
        path,
      });
      succeeded = true;
      return registered;
    } catch (error) {
      if (error instanceof QuotePdfError) throw error;
      console.error("quote_pdf_render_failed", {
        revisionId: input.revisionId,
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message : "unknown",
      });
      throw new QuotePdfError(
        502,
        "pdf_render_failed",
        "The PDF could not be generated. Try again in 30 seconds.",
        30,
      );
    } finally {
      await deps.finish(attemptId, succeeded).catch((error: unknown) => {
        console.error("quote_pdf_finish_failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
      });
    }
  }
}
