import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PRIVILEGED_OUTBOX,
  PRIVILEGED_WRITER,
  serviceRoleConfinementFindings,
} from "../../scripts/service-role-confinement.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const KEY = "SUPABASE_SERVICE_ROLE" + "_KEY";
function project(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "trace-confinement-"));
  roots.push(root);
  const all = {
    [PRIVILEGED_WRITER]: `import "server-only";\nexport const key = process.env.${KEY};\n`,
    [PRIVILEGED_OUTBOX]: `import "server-only";\nexport const key = process.env.${KEY};\n`,
    ...files,
  };
  for (const [relative, source] of Object.entries(all)) {
    const absolute = path.join(root, relative);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
  }
  return root;
}

describe("service-role confinement with the outbox module", () => {
  it("passes on the real working copy and with both modules present", () => {
    expect(serviceRoleConfinementFindings(process.cwd())).toEqual([]);
    expect(serviceRoleConfinementFindings(project({}))).toEqual([]);
  });

  it("requires the outbox module to be server-only", () => {
    const findings = serviceRoleConfinementFindings(
      project({
        [PRIVILEGED_OUTBOX]: `export const key = process.env.${KEY};\n`,
      }),
    );
    expect(findings).toEqual([
      expect.stringContaining('must import "server-only"'),
    ]);
  });

  it("flags a third module naming the key", () => {
    const findings = serviceRoleConfinementFindings(
      project({
        "lib/outbox/other.ts": `export const k = process.env.${KEY};\n`,
      }),
    );
    expect(findings).toEqual([
      expect.stringContaining("lib/outbox/other.ts: names"),
    ]);
  });

  it("allows lib/outbox and route handlers to import the outbox module, and nobody else", () => {
    expect(
      serviceRoleConfinementFindings(
        project({
          "lib/outbox/drain2.ts":
            'import { claimEmails } from "./privileged-outbox";\n',
          "app/api/outbox/drain/route.ts":
            'import { claimEmails } from "@/lib/outbox/privileged-outbox";\n',
        }),
      ),
    ).toEqual([]);
    const bad = serviceRoleConfinementFindings(
      project({
        "components/Panel.tsx":
          'import { claimEmails } from "@/lib/outbox/privileged-outbox";\n',
        "lib/quote-pdf/x.ts":
          'import { claimEmails } from "../outbox/privileged-outbox";\n',
        "app/(application)/q/page.tsx":
          'import { claimEmails } from "@/lib/outbox/privileged-outbox";\n',
      }),
    );
    expect(bad).toHaveLength(3);
  });

  it("keeps the PDF writer importable only from its own folder", () => {
    expect(
      serviceRoleConfinementFindings(
        project({
          "lib/outbox/y.ts":
            'import { x } from "../quote-pdf/privileged-writer";\n',
        }),
      ),
    ).toHaveLength(1);
  });

  it("flags a client component importing the outbox module", () => {
    const findings = serviceRoleConfinementFindings(
      project({
        "lib/outbox/w.tsx":
          '"use client";\nimport { claimEmails } from "./privileged-outbox";\n',
      }),
    );
    expect(findings).toEqual([
      expect.stringContaining('"use client" module imports privileged-outbox'),
    ]);
  });

  it("gives the mail key and the drain secret one owner module each", () => {
    const mailKey = "TRACE_RESEND_API" + "_KEY";
    const drainSecret = "TRACE_OUTBOX_DRAIN" + "_SECRET";
    expect(
      serviceRoleConfinementFindings(
        project({
          "lib/outbox/providers/resend.ts": `export const n = "${mailKey}";\n`,
          "lib/outbox/drain-auth.ts": `export const n = "${drainSecret}";\n`,
        }),
      ),
    ).toEqual([]);
    const findings = serviceRoleConfinementFindings(
      project({
        "lib/outbox/config.ts": `export const n = "${mailKey}";\n`,
        "app/api/outbox/drain/route.ts": `export const n = "${drainSecret}";\n`,
      }),
    );
    expect(findings).toHaveLength(2);
  });
});
