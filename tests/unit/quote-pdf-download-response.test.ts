import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PdfIntegrityError,
  pdfDownloadPath,
  pdfDownloadResponse,
} from "@/lib/quote-pdf/download-response";

const bytes = new TextEncoder().encode("%PDF-1.7\nsample body\n%%EOF");
const expected = {
  sha256: createHash("sha256").update(bytes).digest("hex"),
  byteLength: bytes.byteLength,
};

describe("same-origin PDF download", () => {
  it("serves the stored bytes as a no-store PDF attachment", async () => {
    const response = pdfDownloadResponse(
      bytes,
      expected,
      "TND-2026-0001-rev1.pdf",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="TND-2026-0001-rev1.pdf"',
    );
    expect(response.headers.get("content-length")).toBe(
      String(bytes.byteLength),
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("refuses bytes whose hash differs from the register", () => {
    const tampered = bytes.slice();
    tampered[10] = tampered[10]! ^ 1;
    expect(() => pdfDownloadResponse(tampered, expected, "x.pdf")).toThrow(
      PdfIntegrityError,
    );
  });

  it("refuses bytes whose length differs from the register", () => {
    expect(() =>
      pdfDownloadResponse(bytes, { ...expected, byteLength: 1 }, "x.pdf"),
    ).toThrow(PdfIntegrityError);
  });

  it("points the JSON mode at this route's own path, never another origin", () => {
    expect(
      pdfDownloadPath(
        "https://app.example/quotes/TND-2026-0001/revisions/1/pdf?format=json",
      ),
    ).toBe("/quotes/TND-2026-0001/revisions/1/pdf");
    expect(pdfDownloadPath("http://localhost:3000/a/b/pdf?x=1#f")).toBe(
      "/a/b/pdf",
    );
  });
});
