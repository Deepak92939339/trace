import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PRIVILEGED_WRITER,
  serviceRoleConfinementFindings,
} from "../../scripts/service-role-confinement.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function project(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "tender-confinement-"));
  roots.push(root);
  const all = {
    [PRIVILEGED_WRITER]:
      'import "server-only";\nexport const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n',
    ...files,
  };
  for (const [relative, source] of Object.entries(all)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

describe("service-role key confinement", () => {
  it("passes on the real working copy", () => {
    expect(serviceRoleConfinementFindings(process.cwd())).toEqual([]);
  });

  it("passes when only the privileged writer names the key", () => {
    expect(serviceRoleConfinementFindings(project({}))).toEqual([]);
  });

  it("flags any other app module that names the key", () => {
    const findings = serviceRoleConfinementFindings(
      project({
        "lib/supabase/admin.ts":
          "export const k = process.env.SUPABASE_SERVICE_ROLE_KEY;\n",
      }),
    );
    expect(findings).toEqual([
      expect.stringContaining(
        "lib/supabase/admin.ts: names SUPABASE_SERVICE_ROLE_KEY",
      ),
    ]);
  });

  it("flags the key in components, app routes, the proxy and next.config", () => {
    const findings = serviceRoleConfinementFindings(
      project({
        "components/x.tsx": "const a = 'SUPABASE_SERVICE_ROLE_KEY';\n",
        "app/api/x/route.ts":
          "const a = process.env.SUPABASE_SERVICE_ROLE_KEY;\n",
        "proxy.ts": "const a = process.env.SUPABASE_SERVICE_ROLE_KEY;\n",
        "next.config.ts":
          "export default { env: { a: process.env.SUPABASE_SERVICE_ROLE_KEY } };\n",
      }),
    );
    expect(findings).toHaveLength(4);
  });

  it("flags a NEXT_PUBLIC_ variable carrying the key", () => {
    const findings = serviceRoleConfinementFindings(
      project({
        "lib/x.ts":
          "const a = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;\n",
      }),
    );
    expect(findings.join("\n")).toMatch(/NEXT_PUBLIC_/);
  });

  it("requires the writer to be server-only", () => {
    const findings = serviceRoleConfinementFindings(
      project({
        [PRIVILEGED_WRITER]:
          "export const key = process.env.SUPABASE_SERVICE_ROLE_KEY;\n",
      }),
    );
    expect(findings).toEqual([
      expect.stringContaining('must import "server-only"'),
    ]);
  });

  it("flags a missing writer module", () => {
    const root = mkdtempSync(path.join(tmpdir(), "tender-confinement-"));
    roots.push(root);
    expect(serviceRoleConfinementFindings(root)).toEqual([
      expect.stringContaining("missing"),
    ]);
  });

  it("allows lib/quote-pdf and route handlers to import the writer, and nobody else", () => {
    const ok = serviceRoleConfinementFindings(
      project({
        "lib/quote-pdf/request-handler.ts":
          'import { claimRender } from "./privileged-writer";\n',
        "app/(application)/q/route.ts":
          'import { x } from "@/lib/quote-pdf/privileged-writer";\n',
      }),
    );
    expect(ok).toEqual([]);
    const bad = serviceRoleConfinementFindings(
      project({
        "components/Panel.tsx":
          'import { claimRender } from "@/lib/quote-pdf/privileged-writer";\n',
        "app/(application)/q/page.tsx":
          'import { claimRender } from "@/lib/quote-pdf/privileged-writer";\n',
        "lib/quotes/other.ts":
          'import { claimRender } from "../quote-pdf/privileged-writer";\n',
      }),
    );
    expect(bad).toHaveLength(3);
  });

  it("flags a client component that imports the writer, even from an allowed folder", () => {
    const findings = serviceRoleConfinementFindings(
      project({
        "lib/quote-pdf/widget.tsx":
          '"use client";\nimport { claimRender } from "./privileged-writer";\n',
      }),
    );
    expect(findings).toEqual([
      expect.stringContaining('"use client" module imports privileged-writer'),
    ]);
  });
});
