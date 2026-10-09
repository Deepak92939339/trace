import { createHash } from "node:crypto";

/**
 * The browser is never sent to Supabase Storage: the route reads the stored bytes with the
 * caller's own session (storage RLS still applies) and serves them from the application origin.
 * Pure helpers so the response shape and the integrity check can be unit-tested.
 */

export class PdfIntegrityError extends Error {
  constructor() {
    super("Stored PDF does not match its register entry.");
    this.name = "PdfIntegrityError";
  }
}

/** The same-origin path that serves the bytes: this route's own path, without any query. */
export function pdfDownloadPath(requestUrl: string) {
  return new URL(requestUrl).pathname;
}

/**
 * 200 with the PDF as an attachment. The bytes must be exactly what the register recorded
 * (length and SHA-256); anything else is an integrity failure, never served.
 */
export function pdfDownloadResponse(
  bytes: Uint8Array,
  expected: { sha256: string; byteLength: number },
  filename: string,
) {
  if (
    bytes.byteLength !== expected.byteLength ||
    createHash("sha256").update(bytes).digest("hex") !== expected.sha256
  )
    throw new PdfIntegrityError();
  // Sent as a stream so the platform's buffered-response size limit does not apply.
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
