import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  collectRevisionFiles,
  workspaceReadme,
  type ExportRevision,
} from "../../lib/studio/workspace-export";
import { storedZip } from "../../lib/studio/zip";

const renderPdf = vi.fn(),
  handleQuotePdfRequest = vi.fn();
vi.mock("@/lib/quote-pdf/render", () => ({ renderPdf }));
vi.mock("@/lib/quote-pdf/request-handler", () => ({ handleQuotePdfRequest }));

const revisions: ExportRevision[] = Array.from({ length: 30 }, (_, index) => ({
  id: `rev-${index}`,
  number: `TND-2026-${String(index + 1).padStart(4, "0")}`,
  revisionNumber: 1 + (index % 3),
}));
const withPdf = new Set(["rev-4", "rev-17"]);

describe("workspace export never renders PDFs", () => {
  it("30 issued revisions, 2 with registered PDFs: 30 HTML, 2 PDFs, 28 README lines, zero renders, fast", async () => {
    let htmlCalls = 0,
      pdfLookups = 0;
    const started = performance.now();
    const { files, missingPdf } = await collectRevisionFiles(revisions, {
      html: async (revision) => {
        htmlCalls++;
        return {
          filename: `${revision.number}-rev${revision.revisionNumber}.html`,
          html: `<p>${revision.number}</p>`,
        };
      },
      registeredPdf: async (revision) => {
        pdfLookups++;
        return withPdf.has(revision.id)
          ? {
              filename: `${revision.number}-rev${revision.revisionNumber}.pdf`,
              bytes: new TextEncoder().encode("%PDF-1.7 fixture"),
            }
          : null;
      },
    });
    const readme = workspaceReadme({
      organization: "Trace Demo Industries",
      generatedAt: "2026-10-24T00:00:00.000Z",
      missingPdf,
    });
    const zip = storedZip([
      ...files.map((f) => ({
        name: f.name,
        bytes:
          typeof f.content === "string"
            ? new TextEncoder().encode(f.content)
            : f.content,
      })),
      { name: "README.txt", bytes: new TextEncoder().encode(readme) },
    ]);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(htmlCalls).toBe(30);
    expect(pdfLookups).toBe(30);
    expect(files.filter((f) => f.name.endsWith(".html"))).toHaveLength(30);
    expect(files.filter((f) => f.name.endsWith(".pdf"))).toHaveLength(2);
    expect(missingPdf).toHaveLength(28);
    const lines = readme
      .split("\n")
      .filter((line) =>
        line.startsWith(
          "PDF not generated yet: open the quotation and use Download PDF, then export again.",
        ),
      );
    expect(lines).toHaveLength(28);
    for (const revision of revisions.filter((r) => !withPdf.has(r.id)))
      expect(readme).toContain(
        `${revision.number} revision ${revision.revisionNumber}`,
      );
    for (const id of withPdf) {
      const revision = revisions.find((r) => r.id === id)!;
      expect(readme).not.toContain(`${revision.number} revision`);
    }
    expect(zip.length).toBeGreaterThan(0);
    expect(renderPdf).not.toHaveBeenCalled();
    expect(handleQuotePdfRequest).not.toHaveBeenCalled();
  });
  it("keeps archive order deterministic under concurrent reads", async () => {
    const slow = (index: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, (30 - index) % 7));
    const { files } = await collectRevisionFiles(revisions, {
      html: async (revision) => {
        await slow(Number(revision.id.slice(4)));
        return { filename: `${revision.number}.html`, html: "x" };
      },
      registeredPdf: async () => null,
    });
    expect(files.map((f) => f.name)).toEqual(
      revisions.map((r) => `quotes/${r.number}.html`),
    );
  });
  it("the server wiring has no render, ensure-pdf or privileged-writer dependency", () => {
    for (const file of [
      "lib/studio/workspace-server.ts",
      "lib/studio/workspace-export.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      for (const forbidden of [
        "quote-pdf/render",
        "request-handler",
        "ensure-pdf",
        "privileged-writer",
        "handleQuotePdfRequest",
        "renderPdf",
      ])
        expect(source, `${file} must not use ${forbidden}`).not.toContain(
          forbidden,
        );
    }
  });
  it("README lists nothing when every revision already has a PDF", () => {
    expect(
      workspaceReadme({ organization: "X", generatedAt: "t", missingPdf: [] }),
    ).not.toContain("PDF not generated yet");
  });
});
