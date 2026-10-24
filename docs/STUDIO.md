# Document Studio

Document Studio designs the presentation of issued quotations. Open **Documents** in the sidebar. Preview one of eight built-ins, duplicate it to edit, save, and set the saved template as default. Managers manage templates; organization admins also manage brand/logos and workspace exports. Operators and reviewers can read the Studio. Capabilities are enforced again in every mutation RPC.

The implementation is a draft pending local verification. SQL, pgTAP and Playwright are **WRITTEN, NOT EXECUTED**. Physical pagination, exact prototype fidelity, repeating footers/page numbers, and reviewer print permissions are not settled. See the bundle report for actual checks and limitations.

## Layout and templates

`lib/studio/layout-schema.ts` defines layout v1. It has page size/margins, corners/rules/density, and 1–60 ordered blocks. Block IDs are unique lowercase letters/digits/hyphens, 1–40 characters. The vocabulary is letterhead, logo, cover, quote_meta, parties, intro, line_items, totals, extra_charges, payment_schedule, terms, acceptance, notes, spacer, free_text and footer. Props are closed, optional objects with fixed defaults. Text is capped at 2,000 Unicode characters. Columns/metadata fields are closed, nonempty, duplicate-free lists. At most one line-items block and one totals block are allowed. Canonical UTF-8 layout JSON is at most 64 KiB.

The SQL twin is `studio_layout_is_valid(jsonb)`. TypeScript and SQL validate before saving/rendering. An invalid pinned layout logs a server warning and uses the legacy print document. Tokens resolve once from a closed list; unknown tokens produce empty text and editor warnings. Text always becomes React text, with no HTML editor or user CSS.

Eight typed constants live in `lib/studio/templates/`, versioned by `SYSTEM_TEMPLATE_VERSION`. A private SQL copy supports `duplicate_document_template(base_key,name)`; unit tests compare those copies. Built-ins are immutable source data. Organization copies are versioned database rows. Saving checks `expected_version`, increments version and appends a historical layout. A conflict requires reloading/reconciling before retrying.

`PrintData` contains presentation strings derived only from `IssuedPrintProps`. Money uses the existing formatter over supplied sealed values; no Studio calculator exists. Currency comes from the quotation. `taxCode` is labelled **Tax code**. Issued props currently have no independent quotation title, product spec or image: the title is the existing Commercial quotation label; spec cells are empty.

## Pinning and reprints

The issued quotation page prepares its hidden print presentation eagerly. For a caller with quote.print it invokes `pin_revision_layout(revision_id)`. PDF render preparation and HTML export use the same RPC. It accepts only a revision ID, reads the organization's default/brand on the server, and copies both into an immutable row anchored to organization, quote, revision and snapshot hash. Logo bytes are immutable and retained through asset links. Later template/default/brand changes do not modify the copied row.

All Studio writes take the same organization advisory lock. This serializes pin selection against saves, defaults, brand changes and asset deletion. Repeated pins return the existing row. Organizations without a default, pre-install issued revisions, and already registered legacy PDFs return null and retain the original renderer. The private rollout timestamp records installation time, not an assumed migration date. The no-default path intentionally has no pin row, so selecting a default later can affect a revision that previously used that path; settle that contract if permanent legacy pinning is required.

The PDF state machine, private bucket, integrity register, privileged writer and render throttles are unchanged. HTML uses the same renderer/fonts. Invalid SVG from a direct RPC is neutralized at every render. An asset transport or digest failure fails the request rather than silently dropping a valid logo from a reprint.

## Tables, guards and wipe order

| Order | Table | Parent relationships / guard |
|---|---|---|
| 1 | quote_revision_layout_assets | Composite org/revision and org/asset FKs; immutable |
| 2 | quote_revision_layouts | P5 revision/snapshot anchor and template-version FK; immutable |
| 3 | studio_activity | Organization/actor; append-only |
| 4 | document_template_versions | Composite org/template FK; append-only |
| 5 | document_templates | Organization/actor; RPC writes, cap 25 active, one default |
| 6 | organization_brand | Organization and composite logo FK; RPC writes |
| 7 | document_asset_blobs | Composite org/asset FK; no direct application grants, no updates |
| 8 | document_assets | Organization/creator; no updates, RPC deletion only if unreferenced, cap 8 |
| 9 | studio_export_attempts | Organization; private throttle, RPC writes |
| — | studio_rollout | Private global installation singleton, not tenant data and not wiped |

Every table has RLS enabled. This follows the existing definer/owner guard model rather than claiming FORCE RLS. Browser roles have selected read grants and no table writes. Blob bytes and throttle rows have no direct grants. Public definer entry points explicitly check capabilities; helpers are revoked from application roles.

`studio_destroy_allowed(uuid)` is an owner-only SECURITY DEFINER stub returning false. The independent sandbox migration may replace its body with its enabled/destroying/session-setting check. Immutable-table guards allow only DELETE when that function returns true for old.organization_id; UPDATE/TRUNCATE always fail. `studio_wipe_organization(uuid)` is owner-only, refuses when the hook is false, and uses the order above. Sandbox must call it before deleting quote revisions or organizations. Do not reference sandbox tables from Studio migrations.

## Brand and assets

Brand JSON has lowercase `#rrggbb` primary/accent, font sans/serif/mono-accent, optional logo UUID, and footer/registration strings of at most 200 characters. Fonts are the existing local PDF families. Logo caps are 512 KiB for PNG/JPEG/WebP and 128 KiB for SVG. Upload validates MIME, magic bytes, size and SVG subset in the app; SQL repeats size/signature/digest checks and SVG defence in depth. Metadata and bytes remain in Postgres.

The SVG parser permits only bounded static geometry, local gradients/clips and simple text. No scripts, events, HTML/foreignObject, links, style, DTD/entity expansion or external resources are accepted. Output is revalidated and rendered as a base64 data image, never inline. Corpus: 35 hostile and six benign fixtures. Removing a logo from the current brand does not delete bytes needed by pinned revisions. Delete an unlinked asset only when no pin references it.

## Export

`GET /api/studio/quotes/{number}/revisions/{revision}/html` requires quote.print and returns a private, non-cacheable HTML attachment with embedded local fonts/images and no script. `?view=print` opens the same revision inline. Both paths validate the sealed snapshot first.

`GET /api/studio/workspace` requires workspace.export, organization.manage and the underlying read/print capabilities. It records export.requested and atomically rate-limits to one request per organization per 60 seconds, including failed exports. It caps 200 issued sealed revisions and 50 MiB ZIP size. Over-cap messages direct users to individual downloads.

The stored ZIP contains issued PDF/HTML pairs, quotes/customers/catalog CSVs, active saved templates JSON, current brand JSON/logo and README. Drafts appear only in quotes.csv. CSV fields are explicitly selected, excluding internal cost and approval details; formula-like values are neutralized. Logo bytes are sanitized. PDFs call the existing request handler: existing registered bytes are reused and fresh renders keep all existing limits. A generation failure/429 aborts the ZIP rather than emitting an incomplete success. Keyset pages avoid the Data API's default row limit; concurrent edits mean this is not a transactional database backup.

The ZIP32 writer has deterministic UTF-8 headers, stored entries and table CRC-32, and rejects path traversal/duplicate names. No dependency or zlib version assumption is needed.

## UI and extension points

The desktop editor supports grip drag, Alt+Up/Down, selection/Escape, undo/redo (50 changes), inspector controls, token warnings and a real issued revision chooser. Previews never pin. Below 1024 px edit controls are hidden and the picker/preview remain. Layout and brand edits warn on link navigation/unload; browser back-button guarding remains incomplete. Full asset history/gallery and repeating footer/page numbers remain pending.

`ProfileMenu` accepts `beforeSignOut({proceed,close}) => ReactNode`, replacing its default sign-out item. The sandbox may render its export/delete-warning dialog there and call proceed after the user's decision. Its custom menu item/dialog must preserve keyboard/focus behavior. Other existing sign-out surfaces require the sandbox's own override too.

`/ui-preview/studio` uses only fixture presentation strings; local editor changes do not save. It returns 404 in production. Capture 1440/390 px screenshots at home.

To add a block type:

1. Extend PropMap, PROP_RULES and BLOCK_DEFAULTS; keep props closed and bounded.
2. Update the SQL validator rules in a new migration, not a historical migration after release.
3. Add a hook-free renderer branch; use escaped text and only validated styles/data resources.
4. Extend token/adapter mappings only from sealed print props; add no arithmetic or live money lookup.
5. Add SQL/TS validity, no-network/escaping, determinism, reducer and print tests; version any system-template changes deliberately.

## Verification and known conflicts

Run lint, typecheck, unit suite, build and then test:secrets. On a confirmed disposable local DB run migrations, pgTAP, parity and focused e2e. Use the existing PDF suite plus Studio tests to compare actual paged output at 200 lines. Verify P5 bundled Chromium and local Playwright separately.

Existing tests 15/18 assert exact routine allowlists, and test 24 asserts the old reviewer capability list. They are intentionally untouched in this bundle; approve explicit new expectations locally. Base reviewer has no quote.print. Studio does not bypass that check; reviewer print/HTML requires an explicit product/security decision, while existing registered PDFs retain quote.read access. bytea RPC size/hex transport, hosted tracing/caps and physical pagination remain UNVERIFIED-HOME.
