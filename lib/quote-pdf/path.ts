/** Pure helpers shared by the PDF route, the writer and the tests. */

export const QUOTE_PDF_BUCKET = "quote-pdfs";
/** Lifetime of a signed storage URL. The PDF route no longer issues them (downloads are served
 * from the application origin); still pinned by tests/unit/quote-pdf-path.test.ts. */
export const QUOTE_PDF_SIGNED_URL_SECONDS = 120;
/** Matches the bucket's file_size_limit and the register's byte_length check. */
export const QUOTE_PDF_MAX_BYTES = 10 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function uuid(value: string, label: string) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (!UUID.test(normalized)) throw new RangeError(`${label} must be a UUID.`);
  return normalized;
}

/**
 * The one object path a revision's PDF can have. record_quote_pdf derives the same string in
 * SQL from the revision row and rejects anything else, so the two must stay identical.
 */
export function quotePdfStoragePath(
  organizationId: string,
  revisionId: string,
) {
  return `org/${uuid(organizationId, "organizationId")}/revision/${uuid(revisionId, "revisionId")}.pdf`;
}

/** `<quote number>-rev<n>.pdf`, restricted to [A-Za-z0-9._-]. */
export function quotePdfFilename(quoteNumber: string, revisionNumber: number) {
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1)
    throw new RangeError("revisionNumber must be a positive integer.");
  const safeNumber = quoteNumber
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 80);
  return `${safeNumber || "quotation"}-rev${revisionNumber}.pdf`;
}
