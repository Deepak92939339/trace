import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The Supabase service-role credential may be named by exactly one module of the Next.js
 * application: lib/quote-pdf/privileged-writer.ts. This check is independent of git so it also
 * runs on a plain working copy. It deliberately does not scan supabase/functions (the Edge
 * broker has its own, separately documented use), scripts/, tests/ or docs/.
 */
export const PRIVILEGED_WRITER = "lib/quote-pdf/privileged-writer.ts";
/** P6: the email outbox worker is the second module allowed to hold the key. */
export const PRIVILEGED_OUTBOX = "lib/outbox/privileged-outbox.ts";
const KEY_MODULES = [PRIVILEGED_WRITER, PRIVILEGED_OUTBOX];
/** Other server-only secrets, each readable by exactly one module. */
const SINGLE_OWNER_SECRETS = [
  { name: "TRACE_RESEND_API_KEY", owner: "lib/outbox/providers/resend.ts" },
  { name: "TRACE_OUTBOX_DRAIN_SECRET", owner: "lib/outbox/drain-auth.ts" },
];
const SCANNED_DIRECTORIES = ["app", "components", "lib"];
const SCANNED_FILES = ["proxy.ts", "next.config.ts"];
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const SERVICE_ROLE_NAME = /SUPABASE_SERVICE_ROLE_KEY/;
const PUBLIC_SERVICE_ROLE = /NEXT_PUBLIC_[A-Z0-9_]*SERVICE_ROLE/;
const WRITER_IMPORT = /from\s+["'][^"']*privileged-writer(?:\.[cm]?[jt]s)?["']/;
const OUTBOX_IMPORT = /from\s+["'][^"']*privileged-outbox(?:\.[cm]?[jt]s)?["']/;
const USE_CLIENT =
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/;

function walk(root, directory, out) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) walk(root, absolute, out);
    else if (SOURCE.test(entry.name))
      out.push(relative(root, absolute).split(sep).join("/"));
  }
}

export function serviceRoleConfinementFindings(root) {
  const files = [];
  for (const directory of SCANNED_DIRECTORIES)
    walk(root, join(root, directory), files);
  for (const file of SCANNED_FILES) {
    try {
      if (statSync(join(root, file)).isFile()) files.push(file);
    } catch {
      // The file is optional.
    }
  }

  const findings = [];
  let writerSeen = false;
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    if (PUBLIC_SERVICE_ROLE.test(source))
      findings.push(
        `${file}: a NEXT_PUBLIC_ variable must never carry the service-role key`,
      );
    for (const secret of SINGLE_OWNER_SECRETS)
      if (file !== secret.owner && source.includes(secret.name))
        findings.push(
          `${file}: names ${secret.name}; only ${secret.owner} may`,
        );
    if (KEY_MODULES.includes(file)) {
      if (file === PRIVILEGED_WRITER) writerSeen = true;
      if (!/^\s*import\s+["']server-only["']/m.test(source))
        findings.push(`${file}: must import "server-only"`);
      continue;
    }
    if (SERVICE_ROLE_NAME.test(source))
      findings.push(
        `${file}: names SUPABASE_SERVICE_ROLE_KEY; only ${PRIVILEGED_WRITER} and ${PRIVILEGED_OUTBOX} may`,
      );
    const routeHandler = /^app\/.*\/route\.[jt]s$/.test(file);
    if (WRITER_IMPORT.test(source)) {
      if (!(file.startsWith("lib/quote-pdf/") || routeHandler))
        findings.push(
          `${file}: imports privileged-writer; only lib/quote-pdf/** and route handlers may`,
        );
      if (USE_CLIENT.test(source))
        findings.push(
          `${file}: a "use client" module imports privileged-writer`,
        );
    }
    if (OUTBOX_IMPORT.test(source)) {
      if (!(file.startsWith("lib/outbox/") || routeHandler))
        findings.push(
          `${file}: imports privileged-outbox; only lib/outbox/** and route handlers may`,
        );
      if (USE_CLIENT.test(source))
        findings.push(
          `${file}: a "use client" module imports privileged-outbox`,
        );
    }
  }
  if (!writerSeen)
    findings.push(
      `${PRIVILEGED_WRITER}: the privileged writer module is missing`,
    );
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = serviceRoleConfinementFindings(process.cwd());
  if (findings.length) {
    console.error(`Service-role confinement failed:\n${findings.join("\n")}`);
    process.exit(1);
  }
  console.log(
    `PASS the service-role key is referenced only by ${PRIVILEGED_WRITER} and ${PRIVILEGED_OUTBOX} (server-only), each imported only by its own folder and route handlers; the mail key and drain secret have one owner module each.`,
  );
}
