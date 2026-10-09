import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildPrintHtml } from "../../lib/quote-pdf/print-html";
import { PDF_FONT_FAMILIES, fontDirectory } from "../../lib/quote-pdf/fonts";
import { printPropsFromRevision } from "../../lib/quotes/issued-print-props";
import { canonicalV2Vectors } from "../fixtures/canonical-v2-vectors";

const props = () =>
  printPropsFromRevision({
    snapshot: canonicalV2Vectors[0]!.snapshot,
    issuedAt: "2026-08-14T09:30:00.000Z",
    issuedActor: "Aarav Operator",
    timeZone: "Asia/Kolkata",
  });

describe("PDF document HTML", () => {
  it("is a complete standalone document with the quotation and its payment schedule", async () => {
    const html = await buildPrintHtml({ props: props(), revisionNumber: 3 });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Quotation TND-2026-0001 revision 3</title>");
    expect(html).toContain('class="print-document"');
    expect(html).toContain("Payment schedule");
    expect(html).toContain("Due on 2027-03-31");
    expect(html).toContain("Issuance does not mean delivery.");
    // The same stylesheets as the browser print, @media print rules included.
    expect(html).toContain("@page");
    expect(html).toContain(".print-page");
  });

  it("has no script and no remote resource: everything is inline or a data: URI", async () => {
    const html = await buildPrintHtml({ props: props(), revisionNumber: 1 });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<(?:link|img|iframe|object|embed|source)\b/i);
    expect(html).not.toMatch(/@import/i);
    const urls = [...html.matchAll(/url\(([^)]*)\)/g)].map(
      (match) => match[1]!,
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls)
      expect(url.startsWith("data:font/woff2;base64,")).toBe(true);
    expect(html).not.toMatch(/(?:src|href)=["']https?:/i);
  });

  it("embeds all three families as latin and latin-ext faces and points the app's font variables at them", async () => {
    const html = await buildPrintHtml({ props: props(), revisionNumber: 1 });
    expect((html.match(/@font-face/g) ?? []).length).toBe(6);
    for (const family of ["Inter", "Source Serif 4", "JetBrains Mono"])
      expect(html).toContain(`font-family:"${family}"`);
    expect(html).toContain('--font-sans: "Inter"');
    expect(html).toContain('--font-serif: "Source Serif 4"');
    expect(html).toContain('--font-mono: "JetBrains Mono"');
    // The rupee sign (U+20B9) sits inside the latin-ext range.
    expect(html).toContain("U+20AD-20C0");
  });

  it("escapes the title", async () => {
    const hostile = props();
    hostile.quote.number = '</title><script>alert(1)</script>"';
    const html = await buildPrintHtml({ props: hostile, revisionNumber: 1 });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;/title&gt;&lt;script&gt;");
  });
});

describe("bundled fonts", () => {
  it("ships every file the document embeds, with an OFL license beside each family", () => {
    for (const family of PDF_FONT_FAMILIES) {
      const directory = path.join(fontDirectory(), family.directory);
      for (const subset of ["latin", "latin-ext"])
        expect(
          existsSync(
            path.join(
              directory,
              `${family.directory}-${subset}-wght-normal.woff2`,
            ),
          ),
        ).toBe(true);
      const license = readFileSync(path.join(directory, "OFL.txt"), "utf8");
      expect(license).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
      expect(readdirSync(directory).sort()).toEqual(
        [
          `${family.directory}-latin-ext-wght-normal.woff2`,
          `${family.directory}-latin-wght-normal.woff2`,
          "OFL.txt",
        ].sort(),
      );
    }
    expect(
      readFileSync(path.join(fontDirectory(), "README.md"), "utf8"),
    ).toMatch(/OFL/);
  });
});
