import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

// This entry point creates its own local test project. It never accepts a database URL.
const project = "tender-local-visual-study";
if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.TRACE_CI_DISPOSABLE_LOCAL !== "true"
) {
  throw new Error(
    "CI database setup requires an explicitly disposable GitHub Actions job.",
  );
}
const config = readFileSync("supabase/config.toml", "utf8");
if (!new RegExp(`^project_id = "${project}"$`, "m").test(config)) {
  throw new Error("Unexpected local Supabase project identity.");
}
const existing = spawnSync(
  "docker",
  ["ps", "-aq", "--filter", `label=com.supabase.cli.project=${project}`],
  { encoding: "utf8" },
);
if (existing.status !== 0 || existing.stdout.trim()) {
  throw new Error(
    "CI requires Docker and a fresh disposable project, without existing containers.",
  );
}
const started = spawnSync(
  "./node_modules/.bin/supabase",
  ["start", "--exclude", "studio,analytics,vector,imgproxy"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
  },
);
if (started.status !== 0) process.exit(started.status ?? 1);
const identity = spawnSync(
  "docker",
  [
    "inspect",
    "--format",
    '{{.Name}}|{{index .Config.Labels "com.supabase.cli.project"}}',
    `supabase_db_${project}`,
  ],
  { encoding: "utf8" },
);
if (
  identity.status !== 0 ||
  identity.stdout.trim() !== `/supabase_db_${project}|${project}`
) {
  throw new Error(
    "Created database container did not match the disposable CI project.",
  );
}
console.log("Confirmed disposable local Supabase project for database tests.");
