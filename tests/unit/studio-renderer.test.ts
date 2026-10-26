import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { DocumentRenderer } from "../../components/studio/document-renderer";
import { IssuedPrintDocument } from "../../components/quotes/issued-print-document";
import { renderStaticMarkup } from "../../lib/quote-pdf/static-markup";
import { printPropsFromRevision } from "../../lib/quotes/issued-print-props";
import { printDataFromIssued } from "../../lib/studio/print-data";
import { DEFAULT_BRAND, type Layout } from "../../lib/studio/layout-schema";
import { SYSTEM_TEMPLATES } from "../../lib/studio/templates";
import { canonicalV1Vectors } from "../fixtures/canonical-v1-vectors";
import { canonicalV2Vectors } from "../fixtures/canonical-v2-vectors";

const propsFor = (
  snapshot: Parameters<typeof printPropsFromRevision>[0]["snapshot"],
) =>
  printPropsFromRevision({
    snapshot,
    issuedAt: "2026-08-14T09:30:00Z",
    issuedActor: "Operator",
    timeZone: "Asia/Kolkata",
  });
const studio = (
  props: ReturnType<typeof propsFor>,
  layout: Layout = SYSTEM_TEMPLATES[0].layout,
) =>
  renderStaticMarkup(
    createElement(DocumentRenderer, {
      layout,
      brand: DEFAULT_BRAND,
      data: printDataFromIssued(props),
    }),
  );
describe("Studio sealed adapter and renderer", () => {
  it.each([...canonicalV1Vectors, ...canonicalV2Vectors])(
    "money string parity: $name",
    (vector) => {
      const props = propsFor(vector.snapshot),
        data = printDataFromIssued(props);
      const legacy = renderStaticMarkup(
          createElement(IssuedPrintDocument, props),
        ),
        rendered = studio(props);
      for (const value of [
        data.totals.subtotal,
        data.totals.tax,
        data.totals.grand,
        ...data.items.flatMap((i) => [i.rate, i.amount]),
      ]) {
        expect(legacy).toContain(value);
        expect(rendered).toContain(value);
      }
      expect(studio(props)).toBe(rendered);
    },
  );
  it("escapes hostile names and free text without generating active content or network references", () => {
    const snapshot = structuredClone(canonicalV2Vectors[0]!.snapshot);
    snapshot.buyer.name =
      '</section><script>alert(1)</script><img src="https://evil.test" onerror="x">';
    const layout: Layout = {
      ...SYSTEM_TEMPLATES[0].layout,
      blocks: [
        {
          id: "safe",
          type: "free_text",
          props: { text: '{{customer.name}} <svg onload="x"> {{unknown.x}}' },
        },
      ],
    };
    const html = studio(propsFor(snapshot), layout);
    expect(html).not.toMatch(
      /<script|<svg|<[^>]+\son\w+=|(?:src|href)="https?:/i,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("{{unknown.x}}");
  });
  it("neutralizes SVG inserted by direct RPC and never inlines user SVG", () => {
    const html = renderStaticMarkup(
      createElement(DocumentRenderer, {
        layout: SYSTEM_TEMPLATES[0].layout,
        brand: DEFAULT_BRAND,
        data: printDataFromIssued(propsFor(canonicalV2Vectors[0]!.snapshot)),
        logo: {
          mime: "image/svg+xml",
          bytes: new TextEncoder().encode('<svg onload="x"/>'),
        },
      }),
    );
    expect(html).not.toMatch(/<img|<svg|data:image/);
  });
  it("rejects an invalid layout at the renderer boundary", () => {
    const bad = { ...SYSTEM_TEMPLATES[0].layout, v: 2 } as unknown as Layout;
    expect(studio(propsFor(canonicalV2Vectors[0]!.snapshot), bad)).toBe("");
  });
  it("emits one table with 200 rows and paged-media constraints (physical pagination is checked separately in Chromium)", () => {
    const data = printDataFromIssued(propsFor(canonicalV2Vectors[0]!.snapshot));
    data.items = Array.from({ length: 200 }, (_, i) => ({
      ...data.items[0]!,
      id: String(i),
    }));
    const html = renderStaticMarkup(
      createElement(DocumentRenderer, {
        layout: SYSTEM_TEMPLATES[0].layout,
        brand: DEFAULT_BRAND,
        data,
      }),
    );
    expect(html.match(/<tr>/g)).toHaveLength(201);
    expect(html).toContain("table-header-group");
    expect(html).toContain("break-inside:avoid");
  });
});
