import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";
import { IssuedPrintDocument } from "@/components/quotes/issued-print-document";
import type { IssuedPrintProps } from "@/lib/quotes/issued-print-props";
import { pdfFontCss } from "./fonts";
import { renderStaticMarkup } from "./static-markup";

let styles: Promise<string> | undefined;

/**
 * The application's own stylesheets, read from the source files. They are inlined so the print
 * layout is exactly the browser print layout (same @media print rules), with no request back
 * to the application and no session handed to the browser. next.config.ts lists these files
 * in outputFileTracingIncludes so a serverless bundle carries them.
 */
function applicationCss(): Promise<string> {
  styles ??= Promise.all(
    ["globals.css", "tokens.css"].map((name) =>
      readFile(path.join(process.cwd(), "app", name), "utf8"),
    ),
  ).then((files) => files.join("\n"));
  styles.catch(() => {
    styles = undefined;
  });
  return styles;
}

function escapeText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

/**
 * A complete, self-contained HTML document holding only the issued print document. The same
 * IssuedPrintDocument component and the same CSS as the browser print produce it; the document
 * has no script, no remote resource and nothing but sealed-snapshot content.
 */
export async function buildPrintHtml(input: {
  props: IssuedPrintProps;
  revisionNumber: number;
}) {
  const [css, fonts] = await Promise.all([applicationCss(), pdfFontCss()]);
  // Same component as the browser print. Next.js forbids react-dom/server in this graph, so the
  // element tree is serialized directly (see static-markup.ts for why that is equivalent).
  const body = renderStaticMarkup(
    createElement(IssuedPrintDocument, input.props),
  );
  const title = `Quotation ${input.props.quote.number} revision ${input.revisionNumber}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeText(title)}</title>
<style>${fonts}</style>
<style>${css}</style>
</head>
<body>${body}</body>
</html>`;
}
