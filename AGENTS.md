# Automated contributor guide

- Treat `supabase/migrations/` as the database source of truth and preserve migration order.
- Preserve tenant-scoped RLS, composite organization foreign keys, capability checks, and PostgreSQL commercial invariants.
- Use integer minor money, basis points, and scaled integer quantities. The TypeScript calculator is preview-only and must stay parity-tested against PostgreSQL.
- Never trust client totals, role, organization, actor, version, snapshot, tax, threshold, state, or currency consistency.
- Keep Approved, Issued, and Delivered semantically distinct. Quote activity is append-only.
- Never expose a service-role key or database URL to browser code, and never put a database URL in Next.js. Browser code uses only public Supabase configuration. The Next server runtime may additionally hold the narrowly scoped broker transport secret and public-quote session encryption key (neither grants database access) and, as two deliberate server-only exceptions, `SUPABASE_SERVICE_ROLE_KEY` read by exactly two modules: `lib/quote-pdf/privileged-writer.ts` (PDF storage and registration, P5) and `lib/outbox/privileged-outbox.ts` (the email outbox worker's three fixed routines, P6). `scripts/service-role-confinement.mjs`, run by `npm run test:secrets`, enforces that no other app file names the key or imports those modules. Mail secrets are likewise single-owner (`TRACE_RESEND_API_KEY` in `lib/outbox/providers/resend.ts`, `TRACE_OUTBOX_DRAIN_SECRET` in `lib/outbox/drain-auth.ts`). The isolated `trusted-public-broker` Supabase Edge Function may read the service-role credential only to invoke its four fixed broker RPCs, must authenticate the signed Next transport before dispatch, and must derive rate-limit subjects with its Edge-only HMAC secret.
- Never run `supabase/seed.sql` or the cloud demo seed against an unverified target. The cloud seed must retain its allowlist, direct-host, confirmation, and one-time guards.
- Run formatting, lint, typecheck, unit tests, build, and focused tests for changed behavior. Run `npm run verify` only against the confirmed disposable local Supabase project.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
