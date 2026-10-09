import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

/** Local-only helpers for the issued-PDF spec: direct SQL fixtures, DB reads and PDF text. */
const project = "tender-local-visual-study";
const container = `supabase_db_${project}`;

export const OPERATOR = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "operator@tender.local",
  password: "TenderLocal1!",
};
export const MANAGER = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "manager@tender.local",
  password: "TenderLocal1!",
};
export const OUTSIDER = {
  id: "44444444-4444-4444-8444-444444444444",
  email: "outsider@tender.local",
  password: "TenderLocal1!",
};
export const REVIEWER = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "demo.reviewer@trace.example.test",
  password: "TraceReview2026!",
};
export const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      SUPABASE_TELEMETRY_DISABLED: "1",
    },
  });
  if (result.status !== 0)
    throw new Error(
      `Local command failed (${command}): ${result.stderr.slice(0, 400)}`,
    );
  return result.stdout.trim();
}

let verified = false;
function assertLocalTarget() {
  if (verified) return;
  const status = JSON.parse(
    run("./node_modules/.bin/supabase", ["status", "-o", "json"]),
  ) as { DB_URL?: string };
  const database = new URL(status.DB_URL ?? "postgresql://invalid");
  if (
    !["127.0.0.1", "localhost", "::1"].includes(database.hostname) ||
    database.port !== "54322"
  )
    throw new Error("P5 fixtures require the loopback database.");
  const identity = run("docker", [
    "inspect",
    "--format",
    '{{.Name}}|{{index .Config.Labels "com.supabase.cli.project"}}',
    container,
  ]);
  if (identity !== `/${container}|${project}`)
    throw new Error("P5 fixture container identity is invalid.");
  verified = true;
}

export function psql(sql: string) {
  assertLocalTarget();
  return run("docker", [
    "exec",
    container,
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-q",
    "-c",
    sql,
  ]);
}

export function localApi() {
  const status = JSON.parse(
    run("./node_modules/.bin/supabase", ["status", "-o", "json"]),
  ) as { API_URL?: string; ANON_KEY?: string };
  if (!status.API_URL || !status.ANON_KEY)
    throw new Error("Local Supabase runtime values are unavailable.");
  return { apiUrl: new URL(status.API_URL).origin, anonKey: status.ANON_KEY };
}

export function json<T>(sql: string): T {
  return JSON.parse(psql(sql)) as T;
}

export type IssuedQuote = {
  quoteId: string;
  revisionId: string;
  number: string;
  revisionNumber: number;
};

export const CUSTOMER = "a3000000-0000-4000-8000-000000000001";
export const PRODUCT = "a2000000-0000-4000-8000-000000000001";

export function savePayload(
  notes: string,
  quantity: number,
  lines: number,
  charges = 0,
  discountBps = 0,
) {
  return `jsonb_build_object(
    'customer_id', '${CUSTOMER}', 'currency_code', 'INR', 'locale', 'en-IN',
    'tax_label', 'GST 18%', 'tax_mode', 'exclusive', 'discount_bps', ${discountBps},
    'issue_date', current_date, 'valid_until', current_date + 30,
    'notes', '${notes}',
    'items', (select jsonb_agg(jsonb_build_object('line_id', null, 'product_id', '${PRODUCT}',
      'position', n, 'quantity_scaled', ${quantity}, 'quantity_scale', 1) order by n)
      from generate_series(1, ${lines}) n),
    'charges', coalesce((select jsonb_agg(jsonb_build_object('charge_id', null, 'position', k,
      'charge_type', 'freight', 'description', 'Handling charge ' || k, 'amount_minor', 1000 + k,
      'tax_profile_id', 'a1000000-0000-4000-8000-000000000001', 'discount_applies', false) order by k)
      from generate_series(1, ${charges}) k), '[]'::jsonb))`;
}

export function asOperator(body: string) {
  return `begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${OPERATOR.id}","role":"authenticated"}';
${body}
commit;`;
}

const SCHEDULE = `jsonb_build_array(
  jsonb_build_object('label', 'Deposit', 'basis_points', 5000, 'trigger', 'on_acceptance', 'due_date', null),
  jsonb_build_object('label', 'On delivery', 'basis_points', 3000, 'trigger', 'on_delivery', 'due_date', null),
  jsonb_build_object('label', 'Final instalment', 'basis_points', 2000, 'trigger', 'on_date', 'due_date', (current_date + 60)::text))`;

function genericSchedule(count: number) {
  const share = Math.floor(10000 / count);
  return `(select jsonb_agg(jsonb_build_object('label', 'Milestone ' || k,
    'basis_points', case when k < ${count} then ${share} else ${10000 - share * (count - 1)} end,
    'trigger', 'on_acceptance', 'due_date', null) order by k) from generate_series(1, ${count}) k)`;
}

/** A quotation created, submitted and issued by the seeded operator (no discount: no approval). */
export function provisionIssuedQuote(options: {
  notes: string;
  lines?: number;
  quantity?: number;
  /** The named three-milestone schedule (Deposit, On delivery, Final instalment). */
  schedule?: boolean;
  /** A generic schedule of this many milestones ("Milestone 1" …), shares summing to 100%. */
  milestones?: number;
  charges?: number;
}): IssuedQuote {
  const lines = options.lines ?? 1;
  const quantity = options.quantity ?? 1;
  return json<IssuedQuote>(
    asOperator(`
do $fixture$
declare created jsonb; v_quote uuid; v_revision uuid;
begin
  created := public.create_verified_quote_draft('${ORGANIZATION_ID}', '${CUSTOMER}',
    'INR', 'en-IN', 'GST 18%', 'exclusive', current_date, current_date + 30, extensions.gen_random_uuid());
  v_quote := (created->>'id')::uuid;
  v_revision := (created->>'current_revision_id')::uuid;
  perform public.save_quote_draft(v_quote, 1, extensions.gen_random_uuid(), ${savePayload(options.notes, quantity, lines, options.charges ?? 0)});
  ${
    options.schedule || options.milestones
      ? `update public.quote_payment_schedule_editor set milestones = ${
          options.milestones ? genericSchedule(options.milestones) : SCHEDULE
        }
    where quote_id = v_quote and version = (select version from public.quotes where id = v_quote);`
      : ""
  }
  perform public.submit_quote_revision(v_quote, v_revision, (select version from public.quotes where id = v_quote), extensions.gen_random_uuid());
  perform public.issue_quote_revision(v_quote, v_revision, (select version from public.quotes where id = v_quote), extensions.gen_random_uuid());
  create temporary table p5_fixture(value jsonb) on commit drop;
  insert into p5_fixture values (jsonb_build_object('quoteId', v_quote, 'revisionId', v_revision,
    'number', (select number from public.quotes where id = v_quote), 'revisionNumber', 1));
end;
$fixture$;
select value from p5_fixture;`),
  );
}

/** Starts the next revision and edits the live draft; the previous revision stays issued. */
export function beginSuccessorAndEdit(
  quote: IssuedQuote,
  options: { notes: string; quantity: number },
): { revisionId: string } {
  return json<{ revisionId: string }>(
    asOperator(`
do $fixture$
declare began jsonb; v_revision uuid;
begin
  began := public.begin_quote_revision('${quote.quoteId}', '${quote.revisionId}',
    (select version from public.quotes where id = '${quote.quoteId}'), extensions.gen_random_uuid());
  v_revision := (began->>'current_revision_id')::uuid;
  perform public.save_quote_draft('${quote.quoteId}', (select version from public.quotes where id = '${quote.quoteId}'),
    extensions.gen_random_uuid(), ${savePayload(options.notes, options.quantity, 1)});
  create temporary table p5_fixture(value jsonb) on commit drop;
  insert into p5_fixture values (jsonb_build_object('revisionId', v_revision));
end;
$fixture$;
select value from p5_fixture;`),
  );
}

export function submitAndIssue(quote: IssuedQuote, revisionId: string) {
  const version = `(select version from public.quotes where id = '${quote.quoteId}')`;
  psql(
    asOperator(
      `select public.submit_quote_revision('${quote.quoteId}', '${revisionId}', ${version}, extensions.gen_random_uuid());`,
    ),
  );
  // A successor that changes the commercial terms may need the manager's approval first.
  const state = psql(
    `select state from public.quote_revisions where id = '${revisionId}'`,
  );
  if (state === "waiting")
    psql(`begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${MANAGER.id}","role":"authenticated"}';
select public.approve_quote_revision('${quote.quoteId}', '${revisionId}', ${version}, extensions.gen_random_uuid());
commit;`);
  psql(
    asOperator(
      `select public.issue_quote_revision('${quote.quoteId}', '${revisionId}', ${version}, extensions.gen_random_uuid());`,
    ),
  );
}

export type RegisterRow = {
  revision_id: string;
  organization_id: string;
  quote_id: string;
  storage_path: string;
  sha256: string;
  byte_length: number;
  snapshot_hash: string;
  generated_at: string;
};

export function registerRows(revisionId: string): RegisterRow[] {
  return json<RegisterRow[]>(
    `select coalesce(json_agg(row_to_json(p)), '[]'::json) from public.quote_revision_pdfs p where revision_id = '${revisionId}'`,
  );
}

export function storageObjects(revisionId: string): Array<{ size: number }> {
  return json<Array<{ size: number }>>(
    `select coalesce(json_agg(json_build_object('size', (metadata->>'size')::int)), '[]'::json)
     from storage.objects where bucket_id = 'quote-pdfs' and name like '%/revision/${revisionId}.pdf'`,
  );
}

export function attempts(
  revisionId: string,
): Array<{ outcome: string; user_id: string }> {
  return json<Array<{ outcome: string; user_id: string }>>(
    `select coalesce(json_agg(json_build_object('outcome', outcome, 'user_id', user_id)), '[]'::json)
     from public.quote_pdf_render_attempts where revision_id = '${revisionId}'`,
  );
}

export function revisionSnapshotHash(revisionId: string): string {
  return psql(
    `select snapshot_hash from public.quote_revisions where id = '${revisionId}'`,
  );
}

export function totalMinor(quoteId: string): number {
  return Number(
    psql(`select total_minor from public.quotes where id = '${quoteId}'`),
  );
}

export function scheduleAmounts(revisionId: string): number[] {
  return json<number[]>(
    `select coalesce(json_agg((e->>'amount_minor')::bigint order by (e->>'position')::int), '[]'::json)
     from public.quote_revisions r, jsonb_array_elements(r.snapshot->'payment_schedule') e where r.id = '${revisionId}'`,
  );
}

export async function signIn(
  page: Page,
  user: { email: string; password: string },
) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/quotes$/);
}

export function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function pdfContent(bytes: Uint8Array) {
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const text = await parser.getText();
    const info = await parser.getInfo();
    return {
      perPage: text.pages.map((page) => page.text),
      text: text.text,
      collapsed: text.text.replace(/\s+/g, " "),
      pages: text.total,
      title: (info.info as Record<string, unknown> | undefined)?.Title as
        string | undefined,
      author: (info.info as Record<string, unknown> | undefined)?.Author as
        string | undefined,
    };
  } finally {
    await parser.destroy();
  }
}

/** INR with two minor digits in the same shape the print document uses. */
export function inr(minor: number) {
  return `INR ${(minor / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Operational log only; lets a matrix of renders run without tripping the per-minute limit. */
export function clearRenderAttempts() {
  psql("delete from public.quote_pdf_render_attempts");
}
