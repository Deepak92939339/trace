import { chromium, type Browser } from "playwright-core";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPrintHtml } from "../../lib/quote-pdf/print-html";
import { printPropsFromRevision } from "../../lib/quotes/issued-print-props";
import { DEFAULT_BRAND, type Layout } from "../../lib/studio/layout-schema";
import { SYSTEM_TEMPLATES } from "../../lib/studio/templates";
import { canonicalV2Vectors } from "../fixtures/canonical-v2-vectors";

// Run with npm run test:pdf (Chromium required). Same page.pdf options as lib/quote-pdf/render.ts. Nothing may extend past
// the page margins on either side (for every template, A4 and Letter, narrow/normal/wide), including long names and a
// table long enough to need a second page. The ink bounding box of rasterised pages is measured by the script
// ~/trace-work/pdfmeasure/measure.mjs; here the text boxes from the PDF itself are used so no rasteriser is needed.
const MM_TO_PT = 72 / 25.4;
const MARGIN_MM = { narrow: 10, normal: 16, wide: 22 } as const;
const PAGE_MM = { A4: [210, 297], Letter: [215.9, 279.4] } as const;
const TOLERANCE_PT = 1.5;

function props(rows: number) {
  const snapshot = structuredClone(
    canonicalV2Vectors.find((v) => v.snapshot.items.length > 0)!.snapshot,
  );
  snapshot.buyer.name =
    "Asha Engineering Works and Precision Industrial Manufacturing Private Limited, Unit 4, Phase II, Pune Maharashtra";
  const first = snapshot.items[0]!;
  snapshot.items = Array.from({ length: rows }, (_, index) => ({
    ...first,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    position: index + 1,
  }));
  return printPropsFromRevision({
    snapshot,
    issuedAt: "2026-08-14T09:30:00Z",
    issuedActor: "Operator",
    timeZone: "Asia/Kolkata",
  });
}

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

async function render(
  layout: Layout,
  rows: number,
  font: "sans" | "serif" | "mono-accent" = "sans",
) {
  const html = await buildPrintHtml({
    props: props(rows),
    revisionNumber: 1,
    studio: {
      layout,
      brand: {
        ...DEFAULT_BRAND,
        font,
        footer_line:
          "Northstar Industrial Supply Private Limited · 27 Foundry Park, Unit 4, Pune 411019 · Fictional demonstration",
        registration_line: "Demo company, fictional registration DEMO-0000",
      },
      logo: null,
      layoutHash: "0".repeat(64),
    },
  });
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    const pdf = Buffer.from(
      await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: false,
        tagged: true,
        outline: false,
      }),
    );
    return pdf;
  } finally {
    await page.close();
  }
}

async function textBounds(pdf: Buffer) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: false,
  }).promise;
  const pages: {
    width: number;
    left: number;
    right: number;
    lowest: number;
    text: string;
  }[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const width = page.view[2]! - page.view[0]!;
    const content = await page.getTextContent();
    let left = Infinity,
      right = -Infinity,
      lowest = Infinity,
      text = "";
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      left = Math.min(left, item.transform[4]!);
      right = Math.max(right, item.transform[4]! + item.width);
      lowest = Math.min(lowest, item.transform[5]!);
      text += item.str + " ";
    }
    pages.push({ width, left, right, lowest, text });
  }
  await doc.destroy();
  return pages;
}

describe("Studio PDF stays inside the chosen page margins", () => {
  it.each(SYSTEM_TEMPLATES.map((t) => [t.key, t] as const))(
    "%s: every size and margin, long names, a two-page table",
    async (_key, template) => {
      for (const size of ["A4", "Letter"] as const)
        for (const margin of ["narrow", "normal", "wide"] as const) {
          const layout: Layout = { ...template.layout, page: { size, margin } };
          for (const rows of [3, 60]) {
            const pdf = await render(layout, rows);
            const pages = await textBounds(pdf);
            if (rows === 60)
              expect(
                pages.length,
                `${template.key} ${size} ${margin} needs two pages`,
              ).toBeGreaterThan(1);
            const margin_pt = MARGIN_MM[margin] * MM_TO_PT;
            pages.forEach((page, index) => {
              const label = `${template.key} ${size} ${margin} rows=${rows} page ${index + 1}`;
              expect(
                Math.abs(page.width - PAGE_MM[size][0] * MM_TO_PT),
                `${label} page width`,
              ).toBeLessThan(2);
              expect(page.left, `${label} left edge`).toBeGreaterThanOrEqual(
                margin_pt - TOLERANCE_PT,
              );
              expect(page.right, `${label} right edge`).toBeLessThanOrEqual(
                page.width - margin_pt + TOLERANCE_PT,
              );
              // The footer baseline of the last line stays at least 3 mm above the paper edge (printers cannot print closer).
              expect(
                page.lowest,
                `${label} footer clearance`,
              ).toBeGreaterThanOrEqual(3 * MM_TO_PT);
            });
          }
        }
    },
    240_000,
  );
  // A face that only the page margin boxes use may still be loading at print time (font-display: block hides it), so the
  // footer and counters must use a family the body already loaded. Check they print for every brand font.
  it.each(["sans", "serif", "mono-accent"] as const)(
    "prints the footer and Page x of y on every page with the %s brand font",
    async (font) => {
      const pdf = await render(
        {
          ...SYSTEM_TEMPLATES[0].layout,
          page: { size: "A4", margin: "normal" },
        },
        60,
        font,
      );
      const pages = await textBounds(pdf);
      expect(pages.length).toBeGreaterThan(1);
      pages.forEach((page, index) => {
        expect(
          page.text.replace(/\s+/g, " "),
          `${font} page ${index + 1}`,
        ).toContain(`Page ${index + 1} of ${pages.length}`);
        expect(page.text.replace(/\s+/g, "")).toContain(
          "registrationDEMO-0000",
        );
      });
    },
    120_000,
  );
});
