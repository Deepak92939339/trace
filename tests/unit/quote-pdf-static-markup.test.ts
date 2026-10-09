import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IssuedPrintDocument } from "../../components/quotes/issued-print-document";
import { renderStaticMarkup } from "../../lib/quote-pdf/static-markup";
import {
  printPropsFromRevision,
  type IssuedPrintProps,
} from "../../lib/quotes/issued-print-props";
import { canonicalV1Vectors } from "../fixtures/canonical-v1-vectors";
import { canonicalV2Vectors } from "../fixtures/canonical-v2-vectors";

function propsFor(
  snapshot: Parameters<typeof printPropsFromRevision>[0]["snapshot"],
  actor = "Aarav Operator",
) {
  return printPropsFromRevision({
    snapshot,
    issuedAt: "2026-08-14T09:30:00.000Z",
    issuedActor: actor,
    timeZone: "Asia/Kolkata",
  });
}

function same(props: IssuedPrintProps) {
  const element = createElement(IssuedPrintDocument, props);
  expect(renderStaticMarkup(element)).toBe(renderToStaticMarkup(element));
}

describe("static markup matches react-dom/server for the print document", () => {
  it.each(
    [...canonicalV1Vectors, ...canonicalV2Vectors].map((vector, index) => [
      vector.name,
      index,
    ]),
  )("fixture %s", (_name, index) => {
    const vector = [...canonicalV1Vectors, ...canonicalV2Vectors][
      index as number
    ]!;
    same(propsFor(vector.snapshot));
  });

  it("a 40-line quotation (continued pages, one totals block)", () => {
    const base = canonicalV2Vectors[0]!.snapshot;
    const realistic = canonicalV1Vectors[3]!.snapshot.items;
    const snapshot = {
      ...base,
      items: Array.from({ length: 40 }, (_, index) => ({
        ...realistic[index % 2]!,
        id: `41000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        position: index + 1,
      })),
    };
    const props = propsFor(snapshot);
    same(props);
    expect(
      renderStaticMarkup(createElement(IssuedPrintDocument, props)).match(
        /class="print-page"/g,
      ),
    ).toHaveLength(4);
    expect(
      renderStaticMarkup(createElement(IssuedPrintDocument, props)),
    ).toContain("Page 4 of 4");
  });

  it("text that needs escaping: markup characters, quotes, apostrophes, ampersands, emoji, controls", () => {
    const snapshot = structuredClone(canonicalV2Vectors[0]!.snapshot);
    snapshot.commercial.notes = `<b>"bold" & 'quoted'</b> 😀\ttab\nline & </section><script>x</script>`;
    snapshot.buyer.name = `O'Brien & "Sons" <Ltd>`;
    snapshot.payment_schedule[0]!.label = `Deposit <now> & "later"`;
    same(propsFor(snapshot, `Zoë "Z" <Admin>`));
  });

  it("every adjacent text node (no comment separators between them)", () => {
    const element = createElement(
      "p",
      null,
      "a",
      "b",
      1,
      createElement("span", null, "c", "d"),
      "e",
    );
    expect(renderStaticMarkup(element)).toBe(renderToStaticMarkup(element));
    expect(renderStaticMarkup(element)).toBe("<p>ab1<span>cd</span>e</p>");
  });
});

describe("static markup rejects what it cannot reproduce faithfully", () => {
  it.each([
    [
      "an event handler",
      () => createElement("button", { onClick: () => undefined }, "x"),
    ],
    [
      "raw HTML",
      () =>
        createElement("div", { dangerouslySetInnerHTML: { __html: "<i>" } }),
    ],
    ["a numeric style", () => createElement("div", { style: { width: 10 } })],
    ["a ref", () => createElement("div", { ref: () => undefined })],
    ["children on a void element", () => createElement("br", null, "x")],
    [
      "an object attribute",
      () => createElement("div", { title: {} as unknown as string }),
    ],
    [
      "an async component",
      () => createElement((async () => null) as unknown as () => null),
    ],
  ])("%s", (_name, build) => {
    expect(() => renderStaticMarkup(build())).toThrow();
  });

  it("supports fragments, plain function components and omits empty values", () => {
    const Part = ({ label }: { label: string }) =>
      createElement("i", null, label);
    const element = createElement(
      Fragment,
      null,
      createElement(Part, { label: "x" }),
      null,
      false,
      undefined,
      createElement("hr", {
        hidden: true,
        "data-x": false as unknown as string,
      }),
    );
    expect(renderStaticMarkup(element)).toBe(renderToStaticMarkup(element));
  });
});
