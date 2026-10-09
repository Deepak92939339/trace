# Trace

Trace is a multi-tenant commercial quotation application for preparing priced offers, routing discount decisions, and issuing an accountable customer-facing record. It demonstrates how a compact B2B workflow can keep tenant isolation, exact money, approval policy, lifecycle transitions, and audit activity inside one coherent system.

> Live demo: **[tender-eta-orpin.vercel.app](https://tender-eta-orpin.vercel.app)**

## Status

Trace is deployed as a portfolio demo: a Vercel project (Next.js) plus one dedicated Supabase project, linked above. The repository tracks 37 ordered migrations, 16 App Router pages and 5 route handlers, 29 pgTAP files, 46 unit-test files and 26 Playwright spec files. The hosted database is upgraded by applying new migrations in order **before** deploying the matching application version; see [Deployment](docs/DEPLOYMENT.md). Release history and design evidence live outside the repository.

## What it demonstrates

- Authenticated organizations with role/capability checks and tenant-scoped row-level security (RLS).
- Catalog, customer, draft quote, approval/rejection, issuance, and issued-only print flows.
- Integer minor-unit money, basis-point rates, and scaled integer quantities.
- Optimistic concurrency, idempotent command receipts, immutable submission/issuance snapshots, and append-only quote activity.
- Exact parity checks between the PostgreSQL commercial calculator and the TypeScript preview calculator.
- Issuer controls to create, list, and revoke recipient capability links for issued revisions; recipients see only the authorized public projection and recorded acceptance evidence.

## Architecture

Trace is a Next.js 16 App Router application using React 19, strict TypeScript, Supabase Auth, PostgreSQL, and the Supabase Data API. Server Components and Server Actions use the browser-safe Supabase URL and publishable/anon key with the signed-in user's session. PostgreSQL RLS and capability-aware functions enforce the tenant and authorization boundary.

Authoritative commercial enforcement is implemented in PostgreSQL because writes can arrive from more than one UI path and must be checked atomically with stored state. The TypeScript calculator makes editing responsive, but the database recalculates and validates persisted totals, currencies, quantities, discounts, taxes, versions, actors, and lifecycle transitions. See [Architecture](docs/ARCHITECTURE.md) and [Security](docs/SECURITY.md).

## Local development

Prerequisites:

- Node.js 24 and npm 11
- Docker Desktop (or another working Docker engine)
- Chrome for the configured Playwright projects

```bash
npm ci
npm run db:start
npm run env:local
npm run db:reset
npm run dev
```

Open `http://127.0.0.1:3000`. `npm run env:local` writes an ignored `.env.local` containing only the local browser-safe Supabase URL and anon key. The local reset seed is synthetic and exists only for automated verification; never apply `supabase/seed.sql` to a hosted project.

## Verification

Run the complete gate only against the repository's disposable local Supabase project:

```bash
npm run verify
```

The complete local gate resets the disposable database, applies migrations and the local seed, runs pgTAP, regenerates database types, runs lint, typecheck, unit and parity checks, concurrency runners, a production build, bounded Playwright shards, and tracked/client-asset secret scans. The latest recorded run of the individual checks:

- Unit: **553/553 passed across 46 files**
- pgTAP: **29 files, 1,036 assertions passed**
- Calculator parity: **5,000/5,000 deterministic cases and 2,010 payment-milestone allocations matched exactly**
- Playwright: **170 desktop/mobile assignments: 122 passed, 48 intentional project/mode skips, 0 failed**
- Production build: **passed with 16 App Router pages and 5 route handlers; ESLint and TypeScript passed**
- Security: **signed transport, tracked-file and client-asset secret scans, service-role confinement, and a client bundle with no Supabase URL or client passed**

The reviewer-access spec only runs when `TENDER_DEMO_MODE=true`; see [Contributing](CONTRIBUTING.md) for the shell variables the browser suite needs.

Individual checks are available as `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:auth`, `npm run test:db`, `npm run test:parity`, `npm run test:concurrency`, `npm run test:decisions`, `npm run build`, `npm run test:e2e`, and `npm run test:secrets`.

## Demo access

Normal local behavior keeps self-service signup enabled. Set the server-only variable `TENDER_DEMO_MODE=true` for a public portfolio deployment. In that mode Trace:

- removes signup calls to action;
- redirects `/create-account` to sign-in;
- rejects the signup Server Action before calling Supabase Auth;
- publishes a dedicated reviewer email and password on the sign-in page;
- provides one-click entry to the seeded workspace;
- assigns that identity only `organization.read`, `catalog.read`, `customer.read`, and `quote.read`.

Hosted Supabase email signup remains disabled. The privately held manager identity owns the fictional seed, while the published `demo.reviewer@trace.example.test` identity is deliberately non-secret and read-only. Mutation controls are hidden in the application and denied independently by capability checks, guarded RPCs, and RLS. Do not reuse the published credential for any privileged identity or non-fictional environment.

The cloud demo dataset is separate from the local test seed and never runs during migration deployment. Its allowlist is pinned to the dedicated disposable portfolio-demo project, while application remains a deliberate, guarded, idempotent operator action. See [Demo data](docs/DEMO_DATA.md).

## Deployment

The deployment is Vercel for Next.js plus one dedicated Supabase project, an isolated Supabase Edge function for the public recipient broker, a private storage bucket for issued PDFs, and an email outbox drained by a database scheduler. `.env.example` lists every variable name. The application runtime needs:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`
- `TENDER_DEMO_MODE=true` for the public read-only reviewer demo (the `TENDER_` prefix is a historical name kept for compatibility)
- `TENDER_EDGE_BROKER_TRANSPORT_SECRET` for the server-to-server public broker envelope
- `TENDER_PUBLIC_SESSION_ENCRYPTION_KEY` for the short-lived encrypted recipient session
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; PDF storage and the email outbox)
- `TRACE_MAIL_PROVIDER`, `TRACE_MAIL_FROM`, `TRACE_RESEND_API_KEY`, `TRACE_OUTBOX_DRAIN_SECRET` for email

The transport and session secrets are server-only Next.js runtime values; `TENDER_DEMO_MODE` is a server-only non-secret flag. No database URL is used by Next.js or browser runtime, and the browser never sees the service-role key. The isolated Supabase Edge broker receives the service-role credential for its four fixed RPC calls; the Next.js server additionally holds `SUPABASE_SERVICE_ROLE_KEY` for exactly two server-only modules (PDF storage in `lib/quote-pdf/privileged-writer.ts` and the email outbox worker in `lib/outbox/privileged-outbox.ts`), enforced by `npm run test:secrets`. The browser talks only to the application origin: issued PDFs are streamed through the application, never via a Supabase storage URL. See [Deployment](docs/DEPLOYMENT.md) and [Security](docs/SECURITY.md).

## Known demo limits

- **Email goes only to the project owner.** The demo has no custom sending domain, so Resend only delivers from its shared test sender and only to the email address of the Resend account itself. "Email to buyer" works for that address; mail to any other recipient (including the fictional `*.example.test` demo users) fails and is shown as Failed. Real delivery needs a verified domain.
- **PDF rendering depends on the host.** The first download of an issued revision renders it in a packaged headless Chromium on Vercel; the available function size, memory and duration depend on the Vercel plan. If rendering is unavailable, Print / Save as PDF on the issued view still works and existing PDFs stay downloadable.
- **The reviewer credential is public by design.** `demo.reviewer@trace.example.test` is read-only and exists only in the fictional demo organization.

## Current limitations

- This is a portfolio-grade quotation workflow, not a tax, accounting, ERP, or legal-compliance system.
- Issued means the commercial snapshot was finalized; it does not mean delivered to a customer.
- Email is a transactional outbox with retries and dead-lettering, and each issued revision has one immutable PDF; there is no webhook automation or external integration layer, and delivery beyond the provider hand-off (bounces, opens) is not tracked.
- The demo has one active organization context per user and no membership administration UI.
- Signup mode is deployment configuration; changing it requires a rebuild/redeploy.
- Migrations are forward-only: rollback is a forward fix or a backup-and-restore/recreated-demo decision, not a down-migration command.
- Command receipts retain command payload/result evidence until an operator adopts and documents a retention policy.
- `tax_profiles.price_basis` remains a deprecated compatibility field; quote calculations use the saved quote tax mode and line snapshots.
- Some command functions intentionally lock their aggregate before later authorization/state guards, so rejected contenders can briefly wait rather than bypass serialization.
- The portfolio demo is deployed; independent penetration testing has not occurred.

## Repository map

| Path                   | Purpose                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `app/`                 | App Router pages and Server Actions                                                |
| `components/`          | Application, auth, quote, settings, and UI components                              |
| `lib/`                 | Auth context, Supabase clients, validation, formatting, and preview calculation    |
| `supabase/migrations/` | Ordered database source of truth                                                   |
| `supabase/tests/`      | pgTAP authorization and invariant tests                                            |
| `supabase/demo/`       | Guarded, deliberately invoked fictional cloud dataset                              |
| `tests/unit/`          | Unit and focused auth-policy tests                                                 |
| `tests/e2e/`           | Desktop/mobile Playwright workflows                                                |
| `scripts/`             | Local environment, parity/concurrency, secret, full-gate, and guarded demo tooling |
| `docs/`                | Architecture, security, deployment, and demo-data guidance                         |

## Security and advisories

This repository is a demonstration application and has not been independently penetration-tested. Do not use it for real commercial or personal data without a separate security, privacy, tax, and operational review. After publication, report suspected vulnerabilities through a private GitHub Security Advisory rather than a public issue. Dependency advisory results are reported from the final local release verification and should not be interpreted as proof that every transitive package is unreachable.

Stage 4 updated the direct Next.js and matching ESLint integration to `16.3.2`, with normal compatible lockfile updates for PostCSS, Sharp, Nanoid, js-yaml, and undici. The final read-only `npm audit --omit=dev` and full `npm audit` both reported **zero vulnerabilities**. This result is point-in-time evidence, not a substitute for reviewing future advisories before deployment.

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). No open-source license has been selected. Until the owner chooses one, copyright remains reserved and reuse permission is not granted. Realistic choices include MIT for broad permissive reuse, Apache-2.0 for permissive reuse with an explicit patent grant, or a source-available/custom license when portfolio visibility should not imply unrestricted reuse.
