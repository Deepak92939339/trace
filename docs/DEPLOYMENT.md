# Deployment

Trace runs on Vercel (Next.js) plus one dedicated Supabase project. This document describes the current deployment shape and how to upgrade an existing deployment. It does not authorize creating or changing remote resources; every remote step is a deliberate operator action.

## 0. Rules that never change

- **Migrations first, then the application.** The application code assumes the schema it was built with. Never let a `main` push deploy before the matching migrations are applied; set Vercel's Ignored Build Step (Project Settings → Git) while migrating, then restore it.
- Migrations are forward-only. Never edit an applied migration; add a new one.
- Never run `npm run db:reset`, `supabase db reset` or `supabase/seed.sql` against a linked or hosted project.
- Secrets are entered in the Vercel, Supabase or Resend dashboards or at the operator's terminal. They are never committed, pasted into issues or logs, or placed in repository SQL.

## 1. Supabase project

Create a dedicated, disposable portfolio-demo project and record its 20-character project reference. From a trusted operator machine (use a VPN or Cloudflare WARP if your network blocks `*.supabase.co`):

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase migration list --linked
npx supabase db push --dry-run
npx supabase db push
```

`migration list --linked` must show no remote-only rows. Review the dry-run list before applying. Before a migration batch, check the hosted backup capability of the selected Supabase plan in the dashboard (Database → Backups) and take a logical copy outside the repository (`npx supabase db dump --linked -f <path>` for schema and `--data-only` for data).

In Supabase Auth URL Configuration, set Site URL to the primary HTTPS Vercel production URL and list every production domain that serves the app in the redirect allowlist (for example both `https://tender-eta-orpin.vercel.app` and `https://trace-quotes.vercel.app` while an alias is in use). Disable email signup for the public demo, keep anonymous sign-in disabled, and disable unused providers.

## 2. Demo identities and data

Create one dedicated manager Auth user with a strong unique password stored outside source. Copy only its UUID into the invoking shell. Put the real project reference in `supabase/demo/project-allowlist.json` and follow [Demo data](DEMO_DATA.md). Do not use a personal account.

After the fictional organization exists, the guarded reviewer migrations provision the published read-only reviewer: `20260826091000_public_demo_reviewer_identity.sql` creates it and `20260905090000_rename_public_reviewer_identity.sql` renames it to `demo.reviewer@trace.example.test`. Both are inert unless the fictional organization exists. The reviewer credential is published on the sign-in page by design; never assign it to the manager, an organization administrator, or any non-fictional environment.

## 3. Vercel application

Import the GitHub repository as a Next.js project. The Node 24 runtime is declared in `package.json` and `.nvmrc` (set Project Settings → Node.js Version to 24.x). No `vercel.json` is required for the application itself.

Set these runtime variables for Production (and Preview only if previews should work). Variables apply from the next build, so redeploy after changing them. `.env.example` lists every name with a comment.

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (the stable public origin, no trailing slash; used for links in emails)
- `TENDER_DEMO_MODE=true`
- `TENDER_EDGE_BROKER_TRANSPORT_SECRET` (must equal the Edge function secret of the same name)
- `TENDER_PUBLIC_SESSION_ENCRYPTION_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; read only by `lib/quote-pdf/privileged-writer.ts` and `lib/outbox/privileged-outbox.ts`)
- `TRACE_MAIL_PROVIDER=resend`, `TRACE_MAIL_FROM`, `TRACE_RESEND_API_KEY`, `TRACE_OUTBOX_DRAIN_SECRET` (email outbox; see section 6)

The transport and session secrets are server-only; `TENDER_DEMO_MODE` is a server-only non-secret flag (the `TENDER_` prefix is a historical name kept so deployed environments keep working). The transport secret authenticates only the fixed Next-to-Edge broker envelope and does not grant database access. The session key encrypts and authenticates the short-lived capability cookie. Do not expose any secret with a `NEXT_PUBLIC_` prefix. Do not add `SUPABASE_DB_URL` or `PUBLIC_BROKER_RATE_LIMIT_HMAC_SECRET` to Vercel.

### Domains

The production deployment may be reachable on more than one Vercel domain. Keep every domain that has ever appeared in an issued or emailed recipient link attached (or redirecting), because those links contain their origin. `NEXT_PUBLIC_APP_URL` and the scheduler URL (section 7) use the primary domain. Cookies are host-only, so a visitor signs in again on a new host.

## 4. Isolated public broker Edge Function

The browser remains limited to public Supabase configuration. Next calls this function only through its signed server-to-server transport. Deploy `supabase/functions/trusted-public-broker` separately after the migrations are applied:

```bash
npx supabase secrets list --project-ref <PROJECT_REF>
npx supabase functions deploy trusted-public-broker --project-ref <PROJECT_REF> --no-verify-jwt
```

Function secrets (names only; set once with `supabase secrets set`, never re-generated casually, because the transport secret must stay identical to Vercel's):

- `TENDER_EDGE_BROKER_TRANSPORT_SECRET` (shared only with the Next server runtime)
- `PUBLIC_BROKER_RATE_LIMIT_HMAC_SECRET`

The Supabase Edge runtime supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Inside this function the service-role credential is used only for its fixed calls to `broker_open_quote`, `broker_record_quote_event`, `broker_accept_quote`, and `broker_verify_quote`. Outside it, only the two Next.js server modules listed in section 3 may hold the credential (PDF storage and the email outbox). Never copy it into browser code, environment examples, build arguments, or logs. The Edge handler does not read public forwarding headers. It accepts a normalized client-address representation only after authenticating the HMAC envelope from Next.

Keep JWT verification disabled at the Supabase gateway so the HMAC-authenticated service-to-service request can reach the handler. Supabase documents that this makes the gateway route publicly invocable, so the function's signed-envelope check is mandatory and direct unsigned requests must return `401` before database dispatch. PostgreSQL remains authoritative for token validation, selector/code rate buckets, idempotency, effective state, and revision-scoped terminal responses. Confirm after deployment that direct `anon` and `authenticated` PostgREST calls to all four broker RPCs remain denied. See [Supabase Authorization headers](https://supabase.com/docs/guides/functions/auth-headers) and [Function configuration](https://supabase.com/docs/guides/functions/function-configuration).

### Trusted client address

On a direct Vercel deployment, the Next runtime may normalize `x-forwarded-for` only when the documented `VERCEL=1` system marker is present. Vercel documents `x-forwarded-for` as the client's public IP and says it overwrites the header to prevent spoofing. A proxy in front of Vercel changes that guarantee unless Vercel Trusted Proxy is deliberately configured. See [Vercel request headers](https://vercel.com/docs/headers/request-headers) and [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

Local, self-hosted, missing, multi-valued, or malformed address input becomes `unattributed:v1`; the implementation does not fall back to `x-real-ip`, `cf-connecting-ip`, or an arbitrary forwarding chain. Next signs the normalized representation, and Edge uses it only after signature verification. PostgreSQL's selector- and verification-code-specific buckets remain active when the non-IP fallback is used.

### Capability session

The same-origin session exchange stores only the selector, raw share secret, version, and a five-minute absolute expiry in an AES-256-GCM cookie. The cookie is `HttpOnly`, host-only, `SameSite=Strict`, `Secure` in production, and scoped to `/api/public-quotes`. It is not independent authority: every use is revalidated by the broker, so revoked, superseded, expired, accepted, or otherwise terminal link authority stops working immediately and causes the cookie to be cleared. The committed Stage 1 open projection does not expose the link's exact timestamp, so the browser cookie uses the short fixed storage lifetime while PostgreSQL enforces the exact earlier authority cutoff. Current recipient document reloads require reopening the original fragment capability link; cookie-backed document restoration is a documented non-blocking follow-up.

## 5. Issued PDFs (storage bucket and rendering)

Migration `20260903090000_p5_issued_pdfs.sql` creates the **private** `quote-pdfs` bucket (10 MiB, `application/pdf`) and a single read policy for members with `quote.read` on a registered file. Browser roles can never write to it; the Next server writes through the service-role key.

- **Same-origin downloads.** `GET /quotes/<number>/revisions/<n>/pdf` reads the stored object with the caller's own session, checks it against the immutable register (length and SHA-256), and serves it as an attachment from the application origin. The browser is never redirected to `*.supabase.co`, which matters on networks that block it. `?format=json` returns the route's own path plus the registered hash and size.
- **Rendering on Vercel.** The first request for an issued revision renders the PDF with `playwright-core` driving the packaged Chromium from `@sparticuz/chromium`. The two packages are pinned to the same Chromium major (149) and must be upgraded together. This path has not yet been run on Vercel until the production smoke test below passes. Check in the Vercel dashboard (plan-dependent, verify there): function size of the PDF route, memory tier, and a maximum duration of at least 60 s; the route declares `maxDuration = 60`.
- **Smoke test.** As the manager, open an issued quote and use Download PDF; the first request renders (allow time for a cold start), the second is instant, `select count(*) from public.quote_revision_pdfs` increases by exactly one per revision, and the file's pages match the issued document. If rendering cannot work on the chosen plan, Print / Save as PDF on the issued-only print view remains available and existing PDFs stay downloadable.

## 6. Email outbox

Transactional email is queued in the database in the same transaction as the event that causes it and sent by a separate drain; nothing sends inline.

1. Apply migration `20260904090000_p6_email_outbox.sql`.
2. Set `TRACE_MAIL_PROVIDER=resend`, `TRACE_RESEND_API_KEY`, `TRACE_MAIL_FROM`, `NEXT_PUBLIC_APP_URL`, and `TRACE_OUTBOX_DRAIN_SECRET` (at least 32 random characters, for example `openssl rand -hex 32`) on the Next.js server and redeploy. In production there is no default provider: leaving `TRACE_MAIL_PROVIDER` unset makes the drain answer `503 not_configured`.
3. Failed sends retry at 1 min, 5 min, 30 min, 2 h and 6 h, then dead-letter; the quote page's Emails list shows Queued, Sent or Failed. "Sent" means handed to the provider, not delivered.
4. Delivery is at least once. If the worker dies after the provider accepted a buyer email but before the row is marked sent, the retry mints a new link and revokes the first, so the buyer may hold two emails of which only the second link works.

**Sender limits without a custom domain.** Resend only sends from its shared test sender (`onboarding@resend.dev`) until you verify a domain you control, and in that mode it delivers only to the email address of the Resend account itself (check Resend's current rules in its dashboard and documentation). Without a domain, set `TRACE_MAIL_FROM` to `Trace <onboarding@resend.dev>` and test with your own address; mail to any other recipient, including the fictional `*.example.test` demo users, fails and is shown as Failed. Real buyer delivery needs a verified domain and a `TRACE_MAIL_FROM` on it.

## 7. Outbox scheduler (pg_cron and pg_net, secret in Vault)

Nothing sends while no scheduler calls the drain route. The scheduler is configured in the hosted database at deploy time, not by the application and not in repository SQL:

1. Dashboard → Database → Extensions: enable `pg_cron` and `pg_net`.
2. Dashboard → Database → Vault: add a secret named `trace_outbox_drain_secret` whose value equals `TRACE_OUTBOX_DRAIN_SECRET`. Use the Vault interface rather than a SQL snippet, because the SQL editor keeps query history.
3. In the SQL editor, schedule the job once. It refers to the secret by name, so no value appears in SQL or in `cron.job`:

```sql
select cron.schedule(
  'trace-outbox-drain',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<primary-production-domain>/api/outbox/drain',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'trace_outbox_drain_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
```

Check `cron.job_run_details` and `net._http_response` for `200` responses. `select cron.unschedule('trace-outbox-drain');` stops all sending immediately. Do not enable the scheduler until a manual drain from an operator machine has succeeded:

```bash
read -r -s -p "drain secret: " TRACE_OUTBOX_DRAIN_SECRET; export TRACE_OUTBOX_DRAIN_SECRET
node scripts/drain-outbox.mjs --url https://<primary-production-domain>
unset TRACE_OUTBOX_DRAIN_SECRET
```

Make sure Vercel Deployment Protection, bot protection or firewall rules do not challenge `POST /api/outbox/drain`.

## 8. Preflight and smoke test

Before deployment, run `npm ci`, `npm run verify` (against the disposable local project only), and a production build with the intended demo flag. After deployment:

1. Confirm the landing page and sign-in page load over HTTPS and read "Trace".
2. Confirm signup calls to action are absent and `/create-account` redirects to sign-in.
3. Confirm unauthenticated `/quotes` and `/settings/organization` requests redirect with a safe local return target.
4. Use **Enter reviewer workspace** and confirm Quotes, Customers, Catalog, Approvals, and Help load while create/edit/approve/reject/issue controls remain absent.
5. Open an issued quote and verify the issued-only print view and captured seller/customer snapshots.
6. Open a newly created public capability link. Confirm its fragment is removed, the recipient document matches the issued snapshot, and no secret reaches the query string or browser storage.
7. Confirm the exact database-projected acceptance statement appears before acceptance, record one acceptance, and replay its idempotency key without creating duplicate evidence.
8. Verify a valid normalized verification code returns bounded public evidence and invalid codes do not reveal internal data.
9. Confirm direct `anon` and `authenticated` calls to each broker RPC are denied, and an unsigned request to the Edge function returns `401` before database dispatch.
10. Attempt a direct Auth signup and confirm hosted Supabase rejects it.
11. Download a PDF (section 5) and send one test email to the Resend account address (section 6).
12. With the network tab open and any VPN off, run the whole flow and confirm the browser makes no request to `*.supabase.co`.
13. Review Vercel and Edge logs without recording credentials, capability secrets, or database URLs.

## Rollback and recovery

This is a disposable portfolio demo. Roll back application code with Vercel's Instant Rollback to the previous known-good deployment (Deployments → the deployment's menu; verify the exact wording and its effect on automatic domain assignment in the dashboard). Database migrations are forward-only; before applying a new migration, use the hosted backup capability appropriate to the selected Supabase plan and keep a logical dump. For a release-candidate failure, prefer recreating a clean demo project, reapplying reviewed migrations, and deliberately reseeding rather than running a generic destructive reset against a hosted URL. To stop all outgoing email at once, run `cron.unschedule('trace-outbox-drain')`.
