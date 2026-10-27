# Engineering fixes — 26 October 2026

This package starts from `origin/main` at `1de8d9d`, preserving merged PR #4's read-only Studio width fix. It contains ENG-01..07 plus the local-font build repair. All execution was against the disposable local Supabase project; no hosted smoke or deployment was attempted.

## Changes

- **ENG-01:** Customers and Catalog use their existing scoped RPCs with 50 displayed records, one lookahead and a visible 10,000-offset bound. Catalog cost reads require `margin.read` and include only the displayed IDs.
- **ENG-02:** Quotes adds literal number/customer search, lifecycle filters, organization-local effective expiry, stable ordering and bounded pages. Real E2E exposed and fixed an ordinary-filter quoting bug: regex operands are raw in ordinary PostgREST filters and JSON-quoted only inside logic expressions. Quotes retains its existing organization-filtered table query and RLS; it was not an RPC before this work.
- **ENG-03/04:** Command wording describes navigation. Issued pages and Studio explain first-view layout finalization. Existing `quote.print` checks, pinning RPC and immutable history are unchanged.
- **ENG-05:** SHA-pinned application, PDF and disposable-local database jobs, with timeouts/concurrency and read-only contents permission. Triggers are pull requests and pushes to main. PDF geometry tests move to `tests/browser`. The local E2E server receives its PDF writer credential only from verified local CLI status. Commitment concurrency fixtures now use database-relative dates; both browser engines are installed for the database job.
- **ENG-06:** The first commit is exact Prettier output of its parent for all 81 changed files. The pre-existing untracked HTML demonstration is excluded and untouched.
- **ENG-07:** This evidence and [development commands](DEVELOPMENT.md) supersede implementation-pass validation claims; historical deployment records remain unchanged.

The browser reuses six existing OFL font files through `app/fonts.css`. Font binaries added to Git: **0 bytes**. Final emitted client font assets: **281,788 bytes**, versus **486,428 bytes** in the font-repair parent's production build. Full license texts are also in `public/fonts/LICENSES`. PDF font sources are unchanged; generated probes embed the expected Inter, Source Serif 4 and JetBrains Mono glyph programs.

## Local gate results

| Gate                                                             | Result                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Each commit's TypeScript check                                   | All seven passed independently; first six trees are listed in the JSON evidence and the final docs tree is checked at packaging completion |
| Typecheck, lint, Prettier, production build, secrets/confinement | Passed                                                                                                                                     |
| Unit                                                             | 734/734 across 62 files                                                                                                                    |
| PDF geometry                                                     | 11/11 passed outside the macOS process sandbox; initial sandbox startup failed before tests                                                |
| pgTAP                                                            | 31 files, 1,270 assertions passed                                                                                                          |
| Calculator / milestone parity                                    | 5,000 / 2,010 cases passed                                                                                                                 |
| Canonical commitment parity                                      | 4 v1 + 3 v2 vectors passed                                                                                                                 |
| Quote-number, decision, commitment concurrency                   | Passed; commitment runner first needed stale fixture dates repaired                                                                        |
| 101 Customer/Product and 1,001 Quote isolated-tenant E2E         | Both desktop/mobile assignments passed, including tenant parameter tampering                                                               |
| Full Studio author/reprint/export E2E                            | **Failed** on desktop/mobile: local Storage upload HTTP 500, PostgreSQL `42P10`; app returns 502                                           |
| Studio reviewer checks, run independently                        | 4/4 passed, including readable Editor width and denied export                                                                              |
| Serial dirty/leave-guard checks                                  | **Not run** after author-flow failure                                                                                                      |
| GitHub Actions / hosted smoke                                    | Pending / not run; no hosted Supabase or Vercel execution                                                                                  |

The local Storage indexes differ from the running service's expected conflict target; that supports a service/schema incompatibility, without proving the full version root cause. No Storage schema/index was changed to force a green result.

## Review evidence

[Exact SDK requests](engineering-evidence/2026-10-26/search-exact-requests.jsonl) cover `%`, `_`, backslash, comma, parentheses, asterisk, dot, a 300-character string, `or=(` text and a tenant-like UUID. Table-driven assertions preserve filter structure and organization scoping. The isolated-tenant E2E verifies the actual browser/server boundary.

[Live cost-boundary evidence](engineering-evidence/2026-10-26/margin-live.json) complements the async Catalog page tests. The seeded operator actually has `margin.read`; the precise no-margin case clones its role minus that capability temporarily in the disposable database, verifies responses and restores the original membership in `finally`. The seeded reviewer is unchanged.

[Action tag evidence](engineering-evidence/2026-10-26/workflow-pins.json): both tag commits match all six pins. The connected read-only GitHub API first verified both tags. Required `gh api` checks subsequently passed through a temporary process-only GitHub TLS tunnel using the host’s working DNS64 route; ordinary API DNS initially failed. No system DNS or TLS verification setting changed. No branch-protection/ruleset settings were changed.

[Font asset hashes](engineering-evidence/2026-10-26/font-bytes.json), [embedded PDF glyph programs](engineering-evidence/2026-10-26/pdf-embedded-streams.json), and [isolated per-commit typechecks](engineering-evidence/2026-10-26/per-commit-typecheck.json) provide inspectable evidence.

## Before/after visuals

The parent production build is `baf1729` in a temporary worktree, with no stash; the after build is the final application source. Each comparison shows desktop 1440 above/mobile 390 below, before left/after right. These are cropped overviews; full originals are retained with the local package report. They also show the intended ENG-01..04 UI differences.

- [Landing](engineering-evidence/2026-10-26/compare-landing.png): no visible font/wrapping difference.
- [Quotes](engineering-evidence/2026-10-26/compare-quotes.png): search/filter controls, pagination/expiry note and navigation wording added; rows move down.
- [Issued quotation](engineering-evidence/2026-10-26/compare-issued.png): finalized-layout notice shifts/insets content; text and figures remain legible.
- [Studio Editor](engineering-evidence/2026-10-26/compare-studio.png): longer guidance wraps and pushes the preview down. Existing mobile horizontal overflow remains before/after.
- [Rupee table glyph probe](engineering-evidence/2026-10-26/compare-rupee-table.png): same legible ₹ appearance at both widths; Catalog pagination added. Production formats currency as `INR`; this screenshot temporarily replaces one Catalog table cell's DOM text with `₹1,24,500.00` solely to test glyph coverage. No file or database data changes for that probe.

`npm run test:pdf` passes outside the sandbox. To repeat in your own Terminal: `cd /Users/sandman/trace && npm run test:pdf`.

This is a draft review package, not release sign-off. Studio's complete export/reprint path and the serial leave-guard flow remain unverified due to the recorded Storage failure; remote CI and hosted behavior remain separate evidence.
