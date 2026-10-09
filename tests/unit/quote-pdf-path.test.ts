import { describe, expect, it } from "vitest";
import {
  QUOTE_PDF_BUCKET,
  QUOTE_PDF_MAX_BYTES,
  QUOTE_PDF_SIGNED_URL_SECONDS,
  quotePdfFilename,
  quotePdfStoragePath,
} from "../../lib/quote-pdf/path";

const org = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const revision = "0f8fad5b-d9cb-469f-a165-70867728950e";

describe("quote PDF storage path", () => {
  it("is deterministic and matches the database's record_quote_pdf path", () => {
    expect(quotePdfStoragePath(org, revision)).toBe(
      `org/${org}/revision/${revision}.pdf`,
    );
    expect(quotePdfStoragePath(org, revision)).toBe(
      quotePdfStoragePath(org, revision),
    );
  });

  it("normalizes case so one revision never has two paths", () => {
    expect(quotePdfStoragePath(org.toUpperCase(), revision.toUpperCase())).toBe(
      quotePdfStoragePath(org, revision),
    );
  });

  it.each([
    "",
    "not-a-uuid",
    "../../etc/passwd",
    `${revision}/../x`,
    `${revision}.pdf`,
    " " + revision,
    "0f8fad5b-d9cb-469f-a165-70867728950",
  ])("rejects %j as an identifier", (bad) => {
    expect(() => quotePdfStoragePath(bad, revision)).toThrow(RangeError);
    expect(() => quotePdfStoragePath(org, bad)).toThrow(RangeError);
  });

  it("pins the bucket, signed-URL lifetime and size limit", () => {
    expect(QUOTE_PDF_BUCKET).toBe("quote-pdfs");
    expect(QUOTE_PDF_SIGNED_URL_SECONDS).toBe(120);
    expect(QUOTE_PDF_MAX_BYTES).toBe(10_485_760);
  });
});

describe("quote PDF filename", () => {
  it("is <quote number>-rev<n>.pdf", () => {
    expect(quotePdfFilename("TND-2026-0001", 1)).toBe("TND-2026-0001-rev1.pdf");
    expect(quotePdfFilename("TND-2026-0001", 12)).toBe(
      "TND-2026-0001-rev12.pdf",
    );
  });

  it("only ever contains [A-Za-z0-9._-]", () => {
    for (const number of [
      'TND/2026"0001',
      "TND 2026\r\nSet-Cookie: x=1",
      "../../evil",
      "ünïcode ₹ 日本語",
      "a;b,c\\d",
    ]) {
      expect(quotePdfFilename(number, 3)).toMatch(/^[A-Za-z0-9._-]+$/);
    }
    expect(quotePdfFilename("../../evil", 3)).not.toContain("/");
    expect(quotePdfFilename("..hidden", 1).startsWith(".")).toBe(false);
  });

  it("falls back to a fixed stem when nothing usable remains", () => {
    expect(quotePdfFilename("", 2)).toBe("quotation-rev2.pdf");
    expect(quotePdfFilename("...", 2)).toBe("quotation-rev2.pdf");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2])(
    "rejects revision number %s",
    (bad) => {
      expect(() => quotePdfFilename("TND-1", bad)).toThrow(RangeError);
    },
  );
});
