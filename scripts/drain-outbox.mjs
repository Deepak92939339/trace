// Local helper: asks a running Trace server to drain the email outbox once (or on an interval).
//
//   node scripts/drain-outbox.mjs [--url http://localhost:3000] [--watch 5]
//
// The drain secret is read from the environment variable named below (the same value the
// server uses; see docs/DEPLOYMENT.md).
//
// It calls the same route the production scheduler calls, so there is one code path. There is no
// daemon in the application; --watch is a convenience loop for local development only.
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};
const base = option("--url", "http://localhost:3000").replace(/\/+$/, "");
const watch = Number(option("--watch", "0"));
const secret = process.env.TRACE_OUTBOX_DRAIN_SECRET;

if (!secret) {
  console.error("TRACE_OUTBOX_DRAIN_SECRET is not set.");
  process.exit(2);
}

async function drainOnce() {
  const response = await fetch(`${base}/api/outbox/drain`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const body = await response.json().catch(() => ({}));
  console.log(
    `${new Date().toISOString()} ${response.status} ${JSON.stringify(body)}`,
  );
  return response.ok;
}

if (watch > 0) {
  for (;;) {
    await drainOnce().catch((error) => console.error(error.message));
    await new Promise((resolve) => setTimeout(resolve, watch * 1000));
  }
} else {
  process.exit((await drainOnce()) ? 0 : 1);
}
