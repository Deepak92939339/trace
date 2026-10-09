# Security

Trace's primary boundaries are authenticated identity, organization membership, explicit capabilities, tenant-scoped RLS, constrained database grants, and transactional command functions.

## Runtime credentials

Browser code uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; both are designed for browser use and depend on RLS for safety. The Next.js runtime additionally holds only `TENDER_EDGE_BROKER_TRANSPORT_SECRET` and `TENDER_PUBLIC_SESSION_ENCRYPTION_KEY`; neither grants database access. `TENDER_DEMO_MODE` is a non-secret server configuration flag. A database URL must never be added to Next.js or browser runtime. `SUPABASE_SERVICE_ROLE_KEY` is never available to the browser; the Next.js server runtime holds it only for two server-only modules (below).

The isolated `trusted-public-broker` Supabase Edge Function receives `SUPABASE_SERVICE_ROLE_KEY` for the buyer broker. It authenticates the signed Next transport before using that credential for its four fixed broker RPCs; it must never be exposed through the browser, build inputs, or logs.

Two Next.js server modules are the only other holders of that credential, each for a fixed purpose: `lib/quote-pdf/privileged-writer.ts` writes and registers immutable PDFs (P5), and `lib/outbox/privileged-outbox.ts` calls the three `service_role`-only email outbox routines `claim_email_outbox`, `outbox_mint_share_link` and `complete_email_outbox` (P6). Both start with `import "server-only"`; `scripts/service-role-confinement.mjs` (run by `npm run test:secrets`) fails if any other file under `app/`, `components/` or `lib/` names the key or imports those modules, or if a `NEXT_PUBLIC_` variable carries it. The mail provider key (`TRACE_RESEND_API_KEY`) and the scheduler secret (`TRACE_OUTBOX_DRAIN_SECRET`) are server-only and each read by one module. The drain route accepts only `Authorization: Bearer <secret>`, compared in constant time. Email is queued in the same transaction as the business event and sent by a separate drain; no share-link secret is ever stored (buyer links are minted at delivery), and internal notification addresses are never readable by browser roles.

The guarded cloud demo command accepts a database URL only from the invoking operator's environment. It does not print or persist it, requires an allowlisted direct project host plus a repeated confirmation value, performs no truncation, and is not part of migration deployment.

## Public demo access

For a public deployment, set `TENDER_DEMO_MODE=true` and disable email signup in hosted Supabase Auth. The application removes signup entry points, redirects the signup page, and rejects the signup Server Action before it calls Auth. The published reviewer credential is deliberately non-secret and must have only `organization.read`, `catalog.read`, `customer.read`, and `quote.read`. RLS and guarded RPC capability checks—not secrecy of the password or hidden buttons—enforce the read-only boundary. The privately held seed identity remains a non-admin `manager` and is not published.

## Reporting

This project has not been independently penetration-tested and is not approved for real personal or commercial data. After the GitHub repository exists, report suspected vulnerabilities with a private GitHub Security Advisory. Include affected routes/functions, reproduction steps, impact, and any suggested mitigation; do not include real secrets or customer data.

## Maintainer checks

- Review dependency advisories and exploit preconditions rather than assuming every transitive advisory is reachable.
- Run the tracked-file and built-client secret scan after every production build.
- Keep Supabase Auth site/redirect URLs exact and disable unused providers.
- Recheck table grants, RLS policies, function execution grants, and composite tenant keys after schema changes.
- Rotate and revoke any credential that reaches source, logs, screenshots, or issue content.
