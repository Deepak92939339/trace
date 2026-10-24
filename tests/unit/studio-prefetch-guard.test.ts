import { describe, expect, it, vi } from "vitest";

const workspaceResponse = vi.fn(async () => new Response("zip"));
const issuedHtml = vi.fn(async () => ({ html: "<p>x</p>", filename: "x.html" }));
vi.mock("@/lib/studio/workspace-server", () => ({ workspaceResponse }));
vi.mock("@/lib/studio/issued-document", () => ({ issuedHtml }));
vi.mock("@/lib/studio/errors", () => ({ studioErrorResponse: () => new Response("error", { status: 500 }) }));

// A Next.js Link prefetch is a GET. The export and HTML routes pin layouts, render PDFs and spend the export slot,
// so they must answer a prefetch with an empty 204 and never run.
describe("Studio side-effecting GET routes refuse prefetch requests", () => {
  it("workspace export", async () => {
    const { GET } = await import("@/app/api/studio/workspace/route");
    for (const header of ["next-router-prefetch", "rsc"]) {
      const response = await GET(new Request("http://localhost/api/studio/workspace", { headers: { [header]: "1" } }));
      expect(response.status).toBe(204);
    }
    expect(workspaceResponse).not.toHaveBeenCalled();
    expect((await GET(new Request("http://localhost/api/studio/workspace"))).status).toBe(200);
    expect(workspaceResponse).toHaveBeenCalledTimes(1);
  });
  it("issued HTML export", async () => {
    const { GET } = await import("@/app/api/studio/quotes/[number]/revisions/[revisionNumber]/html/route");
    const params = Promise.resolve({ number: "TND-1", revisionNumber: "1" });
    const response = await GET(new Request("http://localhost/x", { headers: { "next-router-prefetch": "1" } }), { params });
    expect(response.status).toBe(204);
    expect(issuedHtml).not.toHaveBeenCalled();
    expect((await GET(new Request("http://localhost/x"), { params })).status).toBe(200);
    expect(issuedHtml).toHaveBeenCalledTimes(1);
  });
});
