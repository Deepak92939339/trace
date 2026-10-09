# Contributing

Thank you for considering a contribution to Trace.

## Before starting

Open an issue for substantial behavior or schema changes so the intended workflow and security boundary are clear. Small bug fixes and documentation corrections can go directly to a focused pull request.

Use Node.js 24 and npm 11. Install the locked dependencies with `npm ci`; do not hand-edit `package-lock.json`.

## Development workflow

1. Create a branch from the current default branch.
2. Keep changes focused and add tests for changed behavior.
3. Preserve RLS, tenant keys, database invariants, capability checks, and optimistic concurrency.
4. Run `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test:unit`, and `npm run build`.
5. If database or end-to-end behavior changed, confirm the disposable local Supabase/Docker target and run `npm run verify`.

`npx playwright test` reads a few server settings from the shell (not from `.env.local`): export `SUPABASE_SERVICE_ROLE_KEY` (the local key from `npx supabase status -o env`), a throwaway `TRACE_OUTBOX_DRAIN_SECRET` of at least 32 characters, `TRACE_MAIL_PROVIDER=smtp`, and `TRACE_MAIL_FROM=quotes@trace.test` (the email specs assert that sender). The reviewer-access spec only runs with `TENDER_DEMO_MODE=true`. Build first (`npm run build`): the test server runs `next start`.

After `supabase link` the CLI pins the local service versions to the linked project (`supabase/.temp/*-version`, `storage-migration`; gitignored). Always `npx supabase stop && npm run db:start` before running tests after linking: a stack that was already running keeps its old Storage container while the next `db reset` applies the newer Storage schema, and PDF uploads then fail with Postgres error `42P10`. If the pinned stack proves flaky on your machine (`JWT issued at future` from PostgREST under heavy load), remove those pin files and recreate the stack on the CLI's default images.

Do not commit environment files, passwords, service-role keys, database URLs, generated build/test output, real customer information, or screenshots containing private data. Never use the local seed or reset commands against a hosted database.

## Pull requests

Explain the problem, the chosen approach, affected security or data boundaries, and the exact checks run. Keep formatting-only work separate from functional changes where practical. A pull request should not weaken a failing test or authorization check to obtain a green result.

## Security reports

Do not disclose a suspected vulnerability in a public issue. Once the repository is hosted, use a private GitHub Security Advisory.

## License

No contribution license or open-source license has been selected yet. Discuss licensing with the repository owner before contributing material that depends on a particular licensing model.
