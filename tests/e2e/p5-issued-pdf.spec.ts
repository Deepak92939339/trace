import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  attempts,
  beginSuccessorAndEdit,
  inr,
  localApi,
  MANAGER,
  OPERATOR,
  ORGANIZATION_ID,
  OUTSIDER,
  pdfContent,
  provisionIssuedQuote,
  psql,
  registerRows,
  REVIEWER,
  revisionSnapshotHash,
  scheduleAmounts,
  sha256,
  signIn,
  storageObjects,
  submitAndIssue,
  totalMinor,
  type IssuedQuote,
} from "./p5-support";

// One immutable PDF per issued revision. Desktop only: the route is not viewport specific, and
// the per-user render limit (5 a minute) makes running it twice back to back pointless.
test.describe.configure({ mode: "serial" });

type RoleName = "operator" | "manager" | "reviewer" | "outsider";
const roles = {} as Record<RoleName, { context: BrowserContext; page: Page }>;
const fixtures: Record<string, IssuedQuote> = {};
const known: Record<string, { sha256: string; generatedAt: string }> = {};

const pdfPath = (quote: IssuedQuote, revision = quote.revisionNumber) =>
  `/quotes/${encodeURIComponent(quote.number)}/revisions/${revision}/pdf`;

async function getJson(role: RoleName, path: string) {
  const response = await roles[role].context.request.get(
    `${path}?format=json`,
    { maxRedirects: 0 },
  );
  return {
    status: response.status(),
    headers: response.headers(),
    body: (await response.json().catch(() => null)) as {
      url?: string;
      filename?: string;
      pdf?: {
        revisionId: string;
        sha256: string;
        byteLength: number;
        snapshotHash: string;
        generatedAt: string;
      };
      error?: { code: string; message: string };
    } | null,
  };
}

async function fetchBytes(url: string) {
  const response = await roles.operator.context.request.get(url, {
    headers: {},
  });
  expect(response.status()).toBe(200);
  return {
    bytes: new Uint8Array(await response.body()),
    headers: response.headers(),
  };
}

async function supabaseAs(user: { email: string; password: string }) {
  const { apiUrl, anonKey } = localApi();
  const client = createClient(apiUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword(user);
  expect(error).toBeNull();
  return client;
}

const NO_LEAK = /cost|margin|below_cost/i;
// Wording that would claim an email went out, or a payment state. "delivery" (the due trigger
// and the "does not mean delivery" line) is allowed; "delivered", "sent" and the rest are not.
const NO_SEND_OR_PAYMENT_STATUS =
  /\b(sent|emailed|e-mailed|delivered|paid|received|pending|overdue|outstanding|settled)\b/i;

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== "desktop-chrome") return;
  const baseURL = testInfo.project.use.baseURL as string;
  for (const [name, user] of [
    ["operator", OPERATOR],
    ["manager", MANAGER],
    ["reviewer", REVIEWER],
    ["outsider", OUTSIDER],
  ] as const) {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await signIn(page, user);
    roles[name] = { context, page };
  }
});

test.afterAll(async () => {
  for (const role of Object.values(roles)) await role.context.close();
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "Covered once in desktop Chrome.",
  );
});

test("operator opens Download PDF on the issued quote; the first request renders, stores and registers exactly one file", async () => {
  test.setTimeout(180_000);
  const quote = (fixtures.base = provisionIssuedQuote({
    notes: "P5 base fixture note",
    schedule: true,
  }));
  const { page } = roles.operator;
  await page.goto(`/quotes/${quote.number}`);
  await expect(
    page.getByRole("button", { name: "Print / Save PDF" }),
  ).toBeVisible();
  const link = page.getByRole("link", { name: "Download PDF" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", pdfPath(quote));
  expect(registerRows(quote.revisionId)).toHaveLength(0);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 120_000 }),
    link.click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${quote.number}-rev1.pdf`);
  // The browser never leaves the application origin for the file.
  expect(new URL(download.url()).origin).toBe(new URL(page.url()).origin);
  expect(download.url()).not.toContain("supabase");
  const bytes = new Uint8Array(readFileSync((await download.path())!));
  expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  if (process.env.P5_SAMPLE_PDF)
    writeFileSync(process.env.P5_SAMPLE_PDF, bytes);

  // Registered once, with the hash and size of exactly these bytes.
  const rows = registerRows(quote.revisionId);
  expect(rows).toHaveLength(1);
  const [row] = rows;
  expect(row!.sha256).toBe(sha256(bytes));
  expect(row!.byte_length).toBe(bytes.byteLength);
  expect(row!.snapshot_hash).toBe(revisionSnapshotHash(quote.revisionId));
  expect(row!.organization_id).toBe(ORGANIZATION_ID);
  expect(row!.storage_path).toBe(
    `org/${ORGANIZATION_ID}/revision/${quote.revisionId}.pdf`,
  );
  const objects = storageObjects(quote.revisionId);
  expect(objects).toHaveLength(1);
  expect(objects[0]!.size).toBe(bytes.byteLength);
  expect(attempts(quote.revisionId).map((entry) => entry.outcome)).toEqual([
    "succeeded",
  ]);
  known.base = { sha256: row!.sha256, generatedAt: row!.generated_at };

  // The text of the PDF.
  const content = await pdfContent(bytes);
  // Page counts are proven separately (p5b-print-pagination.spec.ts).
  expect(content.pages).toBeGreaterThanOrEqual(1);
  expect(content.collapsed).toContain(quote.number);
  expect(content.collapsed).toContain(inr(totalMinor(quote.quoteId)));
  expect(content.collapsed).toContain("P5 base fixture note");
  expect(content.collapsed).toContain("Issuance does not mean delivery.");
  expect(content.collapsed).toContain("Payment schedule");
  for (const label of ["Deposit", "On delivery", "Final instalment"])
    expect(content.collapsed).toContain(label);
  for (const percent of ["50.00%", "30.00%", "20.00%"])
    expect(content.collapsed).toContain(percent);
  expect(content.collapsed).toContain("Due on acceptance");
  expect(content.collapsed).toContain("Due on delivery");
  expect(content.collapsed).toMatch(/Due on 20\d{2}-\d{2}-\d{2}/);
  const amounts = scheduleAmounts(quote.revisionId);
  expect(amounts).toHaveLength(3);
  for (const amount of amounts)
    expect(content.collapsed).toContain(inr(amount));
  expect(content.text).not.toMatch(NO_LEAK);
  expect(content.text).not.toMatch(NO_SEND_OR_PAYMENT_STATUS);
  expect(content.title).toBe(`Quotation ${quote.number} revision 1`);
  expect(content.author ?? "").toBe("");

  // The browser print of the same page shows the same lines as the PDF.
  await page.emulateMedia({ media: "print" });
  const printed = await page.locator(".print-document").innerText();
  await page.emulateMedia({ media: "screen" });
  const lines = printed
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
  expect(lines.length).toBeGreaterThan(15);
  for (const line of lines) expect(content.collapsed).toContain(line);
});

test("a second request returns the same stored file: same hash, same generated_at, no new render, served from this origin", async () => {
  const quote = fixtures.base!;
  const before = registerRows(quote.revisionId)[0]!;
  const first = await getJson("operator", pdfPath(quote));
  const second = await getJson("operator", pdfPath(quote));
  for (const result of [first, second]) {
    expect(result.status).toBe(200);
    expect(result.body!.pdf!.sha256).toBe(known.base!.sha256);
    expect(new Date(result.body!.pdf!.generatedAt).getTime()).toBe(
      new Date(before.generated_at).getTime(),
    );
    expect(result.body!.filename).toBe(`${quote.number}-rev1.pdf`);
    expect(result.body!.url).toBe(pdfPath(quote));
    expect(result.headers["cache-control"]).toBe("no-store");
  }
  expect(attempts(quote.revisionId)).toHaveLength(1);
  expect(registerRows(quote.revisionId)).toHaveLength(1);
  expect(storageObjects(quote.revisionId)).toHaveLength(1);

  // Without ?format=json the route serves the same bytes itself: no redirect, no Storage URL.
  const direct = await roles.operator.context.request.get(pdfPath(quote), {
    maxRedirects: 0,
  });
  expect(direct.status()).toBe(200);
  expect(direct.headers().location).toBeUndefined();
  expect(direct.headers()["cache-control"]).toBe("no-store");
  const stored = {
    bytes: new Uint8Array(await direct.body()),
    headers: direct.headers(),
  };
  expect(sha256(stored.bytes)).toBe(known.base!.sha256);
  expect(stored.headers["content-type"]).toContain("application/pdf");
  expect(stored.headers["content-disposition"]).toContain(
    `${quote.number}-rev1.pdf`,
  );
});

test("five concurrent first requests produce exactly one render, one object and one row, all with the same hash", async () => {
  test.setTimeout(180_000);
  const quote = (fixtures.concurrent = provisionIssuedQuote({
    notes: "P5 concurrency fixture",
  }));
  const results = await Promise.all(
    Array.from({ length: 5 }, () => getJson("operator", pdfPath(quote))),
  );
  expect(results.map((result) => result.status)).toEqual([
    200, 200, 200, 200, 200,
  ]);
  const hashes = new Set(results.map((result) => result.body!.pdf!.sha256));
  expect(hashes.size).toBe(1);
  const rows = registerRows(quote.revisionId);
  expect(rows).toHaveLength(1);
  expect([...hashes][0]).toBe(rows[0]!.sha256);
  expect(storageObjects(quote.revisionId)).toHaveLength(1);
  expect(attempts(quote.revisionId).map((entry) => entry.outcome)).toEqual([
    "succeeded",
  ]);
  const stored = await fetchBytes(results[0]!.body!.url!);
  expect(sha256(stored.bytes)).toBe(rows[0]!.sha256);
});

test("a 40-line quotation gives continued pages with headings and one totals block", async () => {
  test.setTimeout(180_000);
  const quote = (fixtures.long = provisionIssuedQuote({
    notes: "P5 forty line fixture",
    lines: 40,
  }));
  const result = await getJson("manager", pdfPath(quote));
  expect(result.status).toBe(200);
  const { bytes } = await fetchBytes(result.body!.url!);
  const content = await pdfContent(bytes);
  // One physical page per print page since P5b (the page model); the exact count is proven
  // for a matrix of shapes in p5b-print-pagination.spec.ts.
  expect(content.pages).toBeGreaterThanOrEqual(3);
  expect(content.collapsed).toContain(
    `Page ${content.pages} of ${content.pages}`,
  );
  expect(content.collapsed.match(/Continued — commercial lines/g)).toHaveLength(
    content.pages - 1,
  );
  expect(content.collapsed.match(/Subtotal/g)).toHaveLength(1);
  expect(content.collapsed).toContain(inr(totalMinor(quote.quoteId)));
});

test("after a successor revision begins, each revision's PDF still shows its own sealed content", async () => {
  test.setTimeout(240_000);
  const first = (fixtures.revised = provisionIssuedQuote({
    notes: "Revision one notes P5",
    quantity: 1,
  }));
  const firstTotal = totalMinor(first.quoteId);
  // The live quote rows now describe a different, unissued draft.
  const draft = beginSuccessorAndEdit(first, {
    notes: "Revision two notes P5",
    quantity: 2,
  });
  const liveTotal = totalMinor(first.quoteId);
  expect(liveTotal).toBeGreaterThan(firstTotal);
  expect(
    psql(`select state from public.quotes where id = '${first.quoteId}'`),
  ).toBe("draft");
  expect(
    psql(
      `select state from public.quote_revisions where id = '${first.revisionId}'`,
    ),
  ).toBe("issued");

  // First-ever request for revision 1, made while the live rows already hold revision 2's edits.
  const one = await getJson("manager", pdfPath(first, 1));
  expect(one.status).toBe(200);
  const oneBytes = (await fetchBytes(one.body!.url!)).bytes;
  const oneContent = await pdfContent(oneBytes);
  expect(oneContent.collapsed).toContain("Revision one notes P5");
  expect(oneContent.collapsed).toContain(inr(firstTotal));
  expect(oneContent.collapsed).not.toContain("Revision two notes P5");
  expect(oneContent.collapsed).not.toContain(inr(liveTotal));
  expect(oneContent.title).toBe(`Quotation ${first.number} revision 1`);

  // The draft has no issued print; issue revision 2 and print both.
  await roles.manager.page.goto(`/quotes/${first.number}`);
  await expect(roles.manager.page.locator(".print-document")).toHaveCount(0);
  submitAndIssue(first, draft.revisionId);
  const second: IssuedQuote = {
    ...first,
    revisionId: draft.revisionId,
    revisionNumber: 2,
  };
  const two = await getJson("manager", pdfPath(second, 2));
  expect(two.status).toBe(200);
  const twoContent = await pdfContent((await fetchBytes(two.body!.url!)).bytes);
  expect(twoContent.collapsed).toContain("Revision two notes P5");
  expect(twoContent.collapsed).toContain(inr(liveTotal));
  expect(twoContent.collapsed).not.toContain("Revision one notes P5");
  expect(twoContent.title).toBe(`Quotation ${first.number} revision 2`);
  expect(two.body!.pdf!.sha256).not.toBe(one.body!.pdf!.sha256);
  expect(two.body!.filename).toBe(`${first.number}-rev2.pdf`);

  // Revision 1 is still revision 1: the same file, not re-rendered from the new live rows.
  const oneAgain = await getJson("manager", pdfPath(first, 1));
  expect(oneAgain.body!.pdf!.sha256).toBe(one.body!.pdf!.sha256);
  expect(oneAgain.body!.pdf!.generatedAt).toBe(one.body!.pdf!.generatedAt);
  expect(attempts(first.revisionId)).toHaveLength(1);

  // The quote page prints the current issued revision from its snapshot.
  await roles.manager.page.goto(`/quotes/${first.number}`);
  await roles.manager.page.emulateMedia({ media: "print" });
  const printed = roles.manager.page.locator(".print-document");
  await expect(printed).toContainText("Revision two notes P5");
  await expect(printed).not.toContainText("Revision one notes P5");
  await roles.manager.page.emulateMedia({ media: "screen" });
});

test("a reviewer downloads an existing PDF but can never trigger a render", async () => {
  test.setTimeout(120_000);
  const base = fixtures.base!;
  const download = await getJson("reviewer", pdfPath(base));
  expect(download.status).toBe(200);
  const stored = await fetchBytes(download.body!.url!);
  expect(sha256(stored.bytes)).toBe(known.base!.sha256);

  const pending = (fixtures.pending = provisionIssuedQuote({
    notes: "P5 not yet generated",
  }));
  const refused = await getJson("reviewer", pdfPath(pending));
  expect(refused.status).toBe(403);
  expect(refused.body!.error!.code).toBe("pdf_generation_forbidden");
  expect(refused.body!.error!.message).toMatch(/quote\.print/);
  expect(registerRows(pending.revisionId)).toHaveLength(0);
  expect(attempts(pending.revisionId)).toHaveLength(0);
  expect(storageObjects(pending.revisionId)).toHaveLength(0);

  // On the page: the link works for an existing PDF, is disabled for a missing one, no Print.
  const { page } = roles.reviewer;
  await page.goto(`/quotes/${base.number}`);
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Print / Save PDF" }),
  ).toHaveCount(0);
  await page.goto(`/quotes/${pending.number}`);
  await expect(
    page.getByRole("button", { name: "Download PDF" }),
  ).toBeDisabled();
  await expect(page.getByText("Not generated yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toHaveCount(0);
});

test("another organization, anonymous visitors and direct storage access get nothing and can forge nothing", async () => {
  const base = fixtures.base!;
  const path = `org/${ORGANIZATION_ID}/revision/${base.revisionId}.pdf`;

  const outsider = await getJson("outsider", pdfPath(base));
  expect(outsider.status).toBe(404);
  expect(outsider.body!.error!.code).toBe("not_found");

  const anonymous = await roles.outsider.context.browser()!.newContext({
    baseURL: test.info().project.use.baseURL as string,
  });
  const anonymousResponse = await anonymous.request.get(pdfPath(base), {
    maxRedirects: 0,
  });
  expect([302, 307]).toContain(anonymousResponse.status());
  expect(anonymousResponse.headers().location).toContain("/sign-in");
  await anonymous.close();

  // The outsider's own session cannot see or sign the object, nor read the register row.
  const outsiderClient = await supabaseAs(OUTSIDER);
  const outsiderRows = await outsiderClient
    .from("quote_revision_pdfs")
    .select("revision_id");
  expect(outsiderRows.error).toBeNull();
  expect(outsiderRows.data).toEqual([]);
  const outsiderSign = await outsiderClient.storage
    .from("quote-pdfs")
    .createSignedUrl(path, 60);
  expect(outsiderSign.data).toBeNull();
  expect(outsiderSign.error).not.toBeNull();
  expect(
    (await outsiderClient.storage.from("quote-pdfs").download(path)).error,
  ).not.toBeNull();

  // Anonymous Supabase access: no register, no object.
  const { apiUrl, anonKey } = localApi();
  const anonymousClient = createClient(apiUrl, anonKey, {
    auth: { persistSession: false },
  });
  expect(
    (await anonymousClient.from("quote_revision_pdfs").select("revision_id"))
      .error,
  ).not.toBeNull();
  expect(
    (await anonymousClient.storage.from("quote-pdfs").createSignedUrl(path, 60))
      .data,
  ).toBeNull();

  // Even the organization's own operator and reviewer can read but cannot write, overwrite or
  // delete the file, or touch the register.
  for (const user of [OPERATOR, REVIEWER]) {
    const client = await supabaseAs(user);
    const signed = await client.storage
      .from("quote-pdfs")
      .createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    const forged = new Blob(["%PDF-1.4 forged"], { type: "application/pdf" });
    const overwrite = await client.storage
      .from("quote-pdfs")
      .upload(path, forged, { upsert: true, contentType: "application/pdf" });
    expect(overwrite.error).not.toBeNull();
    const fresh = await client.storage
      .from("quote-pdfs")
      .upload(
        `org/${ORGANIZATION_ID}/revision/${crypto.randomUUID()}.pdf`,
        forged,
        { contentType: "application/pdf" },
      );
    expect(fresh.error).not.toBeNull();
    const removed = await client.storage.from("quote-pdfs").remove([path]);
    expect(removed.data ?? []).toEqual([]);
    const registerWrite = await client.from("quote_revision_pdfs").insert({
      revision_id: crypto.randomUUID(),
      organization_id: ORGANIZATION_ID,
      quote_id: base.quoteId,
      storage_path: "x",
      sha256: "a".repeat(64),
      byte_length: 1,
      snapshot_hash: "a".repeat(64),
    });
    expect(registerWrite.error).not.toBeNull();
    expect(
      (
        await client
          .from("quote_revision_pdfs")
          .update({ sha256: "b".repeat(64) })
          .eq("revision_id", base.revisionId)
      ).error,
    ).not.toBeNull();
    expect(
      (
        await client
          .from("quote_revision_pdfs")
          .delete()
          .eq("revision_id", base.revisionId)
      ).error,
    ).not.toBeNull();
  }

  // After all of that, the stored file and its row are exactly what the server wrote.
  expect(registerRows(base.revisionId)[0]!.sha256).toBe(known.base!.sha256);
  expect(storageObjects(base.revisionId)).toHaveLength(1);
  const result = await getJson("operator", pdfPath(base));
  expect(sha256((await fetchBytes(result.body!.url!)).bytes)).toBe(
    known.base!.sha256,
  );
});

test("five renders a minute per user, a 30 s cooldown after a failed render, and recovery", async () => {
  test.setTimeout(180_000);
  const quote = (fixtures.limited = provisionIssuedQuote({
    notes: "P5 rate limit fixture",
  }));
  const other = fixtures.long!;

  // Five renders already started this minute by the manager (stand-ins, removed afterwards).
  const ids = psql(`
    insert into public.quote_pdf_render_attempts (revision_id, user_id, started_at, finished_at, outcome)
    select '${other.revisionId}', '${MANAGER.id}', clock_timestamp(), clock_timestamp(), 'succeeded'
    from generate_series(1, 5)
    returning id`).split("\n");
  expect(ids).toHaveLength(5);
  const limited = await getJson("manager", pdfPath(quote));
  expect(limited.status).toBe(429);
  expect(limited.body!.error!.code).toBe("pdf_rate_limited");
  const retry = Number(limited.headers["retry-after"]);
  expect(retry).toBeGreaterThanOrEqual(1);
  expect(retry).toBeLessThanOrEqual(60);
  expect(registerRows(quote.revisionId)).toHaveLength(0);
  expect(attempts(quote.revisionId)).toHaveLength(0);
  psql(
    `delete from public.quote_pdf_render_attempts where id in (${ids.map((id) => `'${id}'`).join(",")})`,
  );

  // A failed render just now: refused for 30 seconds, regardless of who asks.
  const failedId = psql(`
    insert into public.quote_pdf_render_attempts (revision_id, user_id, started_at, finished_at, outcome)
    values ('${quote.revisionId}', '${OPERATOR.id}', clock_timestamp(), clock_timestamp(), 'failed')
    returning id`);
  const cooling = await getJson("manager", pdfPath(quote));
  expect(cooling.status).toBe(429);
  expect(cooling.body!.error!.code).toBe("pdf_render_cooldown");
  const wait = Number(cooling.headers["retry-after"]);
  expect(wait).toBeGreaterThanOrEqual(1);
  expect(wait).toBeLessThanOrEqual(30);
  expect(registerRows(quote.revisionId)).toHaveLength(0);

  // Once the cooldown has passed, the next request renders.
  psql(
    `update public.quote_pdf_render_attempts set started_at = started_at - interval '31 seconds', finished_at = finished_at - interval '31 seconds' where id = '${failedId}'`,
  );
  const recovered = await getJson("manager", pdfPath(quote));
  expect(recovered.status).toBe(200);
  expect(registerRows(quote.revisionId)).toHaveLength(1);
  expect(storageObjects(quote.revisionId)).toHaveLength(1);
});

test("a quotation or revision that does not exist is a 404; a draft revision is not renderable", async () => {
  const base = fixtures.base!;
  expect((await getJson("operator", pdfPath(base, 7))).status).toBe(404);
  expect((await getJson("operator", pdfPath(base, 0))).status).toBe(404);
  expect(
    (await getJson("operator", `/quotes/TND-0000-0000/revisions/1/pdf`)).status,
  ).toBe(404);
  // Revision 2 of the "revised" quote is issued; a fresh draft revision is not.
  const draftQuote = provisionIssuedQuote({ notes: "P5 draft successor" });
  beginSuccessorAndEdit(draftQuote, { notes: "P5 draft body", quantity: 1 });
  const draft = await getJson("operator", pdfPath(draftQuote, 2));
  expect(draft.status).toBe(409);
  expect(draft.body!.error!.code).toBe("pdf_revision_not_renderable");
  expect(attempts(draftQuote.revisionId)).toHaveLength(0);
});
