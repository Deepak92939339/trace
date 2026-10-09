import { spawn, type ChildProcess } from "node:child_process";
import { writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  beginSuccessorAndEdit,
  localApi,
  OPERATOR,
  provisionIssuedQuote,
  psql,
  REVIEWER,
  signIn,
  MANAGER,
} from "./p5-support";
import {
  clearMailbox,
  createShareLink,
  drain,
  messageDetail,
  messagesTo,
  messagesWithSubject,
  outboxFor,
  provisionWaitingQuote,
  queueBuyerEmailViaView,
  rawMessage,
  recordBuyerEvent,
  uniqueAddress,
} from "./p6-support";

// The email outbox against the local mail catcher (Mailpit, SMTP on 54325). Desktop only.
test.describe.configure({ mode: "serial" });

const SECRET_ENV = "TRACE_OUTBOX_DRAIN_SECRET";
let baseURL: string;
let operator: { context: BrowserContext; page: Page };
let drainSecret: string;
let failingServer: ChildProcess | undefined;

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== "desktop-chrome") return;
  baseURL = testInfo.project.use.baseURL as string;
  drainSecret = process.env[SECRET_ENV] ?? "";
  await clearMailbox();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page, OPERATOR);
  operator = { context, page };
});

test.afterAll(async () => {
  await operator?.context.close();
  failingServer?.kill("SIGTERM");
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "Covered once in desktop Chrome.",
  );
  expect(
    drainSecret.length,
    `${SECRET_ENV} (32+ characters) must be set for the server and for this spec`,
  ).toBeGreaterThanOrEqual(32);
});

async function drainNow(url = baseURL) {
  const result = await drain(url, drainSecret);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  return result.body as {
    claimed: number;
    sent: number;
    retried: number;
    dead: number;
    cancelled: number;
  };
}

test("the drain route accepts only the bearer secret", async () => {
  const url = `${baseURL}/api/outbox/drain`;
  expect((await fetch(url, { method: "POST" })).status).toBe(401);
  expect(
    (
      await fetch(url, {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(url, {
        method: "POST",
        headers: { authorization: drainSecret },
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(url, {
        method: "POST",
        headers: { "x-tender-outbox-secret": drainSecret },
      })
    ).status,
  ).toBe(401);
  expect((await fetch(url)).status).toBe(405);
  const ok = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${drainSecret}` },
  });
  expect(ok.status).toBe(200);
  expect(Object.keys(await ok.json()).sort()).toEqual([
    "cancelled",
    "claimed",
    "dead",
    "retried",
    "sent",
  ]);
});

test("Email to buyer queues first; one drain sends exactly one message with a working link; a replay sends nothing more", async () => {
  test.setTimeout(180_000);
  const quote = provisionIssuedQuote({ notes: "P6 buyer email fixture" });
  const address = uniqueAddress("buyer");
  const { page } = operator;
  await page.goto(`/quotes/${quote.number}`);
  const panel = page.getByRole("region", { name: "Email to buyer" });
  await expect(panel).toBeVisible();
  await panel.getByLabel("Buyer email").fill(address);
  await panel.getByRole("button", { name: "Email to buyer" }).click();
  await expect(panel.getByRole("status")).toContainText("Queued.");
  await expect(panel.getByRole("status")).toContainText(
    "has not been sent yet",
  );

  // Queued, not sent: the transaction wrote a row and nothing else happened.
  const list = page.getByTestId("email-activity");
  await expect(list).toContainText(address);
  await expect(list).toContainText("Queued");
  expect(await messagesTo(address)).toHaveLength(0);
  const [queued] = outboxFor(quote.quoteId);
  expect(queued).toMatchObject({
    kind: "quote_to_buyer",
    status: "queued",
    attempts: 0,
    share_link_id: null,
  });

  // Pressing the button again with the same form reuses the command: still one row.
  await panel.getByRole("button", { name: "Email to buyer" }).click();
  await expect(panel.getByRole("status")).toContainText("Queued.");
  expect(
    outboxFor(quote.quoteId).filter((row) => row.kind === "quote_to_buyer"),
  ).toHaveLength(1);

  const first = await drainNow();
  expect(first.sent).toBeGreaterThanOrEqual(1);
  const messages = await messagesTo(address);
  expect(messages).toHaveLength(1);
  const message = messages[0]!;
  expect(message.Subject).toBe(
    `Quotation ${quote.number} from Trace Demo Industries`,
  );
  const detail = await messageDetail(message.ID);
  expect(detail.From.Address).toBe("quotes@trace.test");
  expect(detail.ReplyTo.map((entry) => entry.Address)).toEqual([
    "sales@trace.local",
  ]);
  expect(detail.Text).toContain(`${quote.number}`);
  expect(detail.Text).not.toMatch(
    /\b(cost|margin|paid|received|delivered|threshold)\b/i,
  );
  const link = detail.Text.match(
    /https?:\/\/\S+\/quote\/[0-9a-f-]{36}#secret=[A-Za-z0-9_-]{43}/,
  );
  expect(link, "the email carries exactly one buyer link").not.toBeNull();
  expect(detail.Text.match(/https?:\/\/\S+/g)).toHaveLength(1);
  if (process.env.P6_MAIL_BUYER_PATH)
    writeFileSync(process.env.P6_MAIL_BUYER_PATH, await rawMessage(message.ID));

  // The recorded state: sent once, link minted, and no secret stored anywhere in the outbox.
  const [sent] = outboxFor(quote.quoteId);
  expect(sent).toMatchObject({ status: "sent", attempts: 1 });
  expect(sent!.share_link_id).not.toBeNull();
  const secret = link![0].split("#secret=")[1]!;
  expect(
    psql(`select count(*) from public.email_outbox where to_jsonb(email_outbox)::text like '%${secret}%'
          or exists (select 1 from public.email_outbox_attempts a where to_jsonb(a)::text like '%${secret}%')`),
  ).toBe("0");

  // The link opens the existing buyer route.
  const buyer = await operator.context.browser()!.newContext({ baseURL });
  const buyerPage = await buyer.newPage();
  const url = new URL(link![0]);
  // The buyer route reads through the Edge broker, which can still be warming up.
  await expect(async () => {
    await buyerPage.goto(`${url.pathname}${url.hash}`);
    await expect(buyerPage.getByText(quote.number).first()).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 4_000] });
  await buyer.close();

  // Replay: drain again, nothing is due, still one message; the list says Sent.
  const second = await drainNow();
  expect(second.sent + second.retried + second.dead).toBe(second.claimed);
  expect(await messagesTo(address)).toHaveLength(1);
  await page.reload();
  await expect(page.getByTestId("email-activity")).toContainText("Sent");
  await expect(page.getByTestId("email-activity")).not.toContainText(
    /deliver/i,
  );
});

test("a buyer response notifies the issuer and the link creator once each, and a replayed drain adds nothing", async () => {
  test.setTimeout(120_000);
  const quote = provisionIssuedQuote({ notes: "P6 response fixture" });
  const link = createShareLink(quote, MANAGER);
  const status = recordBuyerEvent(
    "change_requested",
    link,
    "Please move the start\tto March.\nThanks",
  );
  expect(status).toBe("ok");
  const rows = outboxFor(quote.quoteId);
  expect(rows).toHaveLength(2);
  expect(
    rows.every(
      (row) => row.kind === "buyer_change_requested" && row.status === "queued",
    ),
  ).toBe(true);

  await drainNow();
  const subject = `Quotation ${quote.number}: buyer asked for changes`;
  const messages = await messagesWithSubject(subject);
  expect(messages).toHaveLength(2);
  expect(
    messages.flatMap((message) => message.To.map((to) => to.Address)).sort(),
  ).toEqual(["manager@tender.local", "operator@tender.local"]);
  const detail = await messageDetail(messages[0]!.ID);
  expect(detail.Text).toContain(
    "Buyer message:\nPlease move the start to March. Thanks",
  );
  expect(detail.Text).toContain(`/quotes/${quote.number}`);
  expect(detail.Text).not.toMatch(
    /\b(cost|margin|paid|received|delivered|threshold)\b/i,
  );
  if (process.env.P6_MAIL_INTERNAL_PATH)
    writeFileSync(
      process.env.P6_MAIL_INTERNAL_PATH,
      await rawMessage(messages[0]!.ID),
    );

  await drainNow();
  expect(await messagesWithSubject(subject)).toHaveLength(2);

  // A reviewer sees the list, but only "Team notification": never an internal address.
  const context = await operator.context.browser()!.newContext({ baseURL });
  const page = await context.newPage();
  await signIn(page, REVIEWER);
  await page.goto(`/quotes/${quote.number}`);
  const list = page.getByTestId("email-activity");
  await expect(list).toContainText("Team notification");
  await expect(list).toContainText("Buyer asked for changes");
  await expect(list).toContainText("Sent");
  const text = (await list.innerText()) + (await list.innerHTML());
  expect(text).not.toContain("@tender.local");
  expect(text).not.toContain("operator");
  expect(text).not.toContain("manager");
  await expect(
    page.getByRole("region", { name: "Email to buyer" }),
  ).toHaveCount(0);
  await context.close();
});

test("a quotation waiting for approval notifies the approvers, not the submitter, once", async () => {
  test.setTimeout(120_000);
  const quote = provisionWaitingQuote();
  const rows = outboxFor(quote.quoteId);
  expect(rows.length).toBeGreaterThanOrEqual(1);
  expect(rows.every((row) => row.kind === "approval_waiting")).toBe(true);
  expect(rows.map((row) => row.recipient_email)).not.toContain(
    "operator@tender.local",
  );
  expect(rows.map((row) => row.recipient_email)).toContain(
    "manager@tender.local",
  );

  await drainNow();
  const subject = `Quotation ${quote.number} is waiting for approval`;
  const messages = await messagesWithSubject(subject);
  expect(messages).toHaveLength(rows.length);
  expect(
    messages.flatMap((message) => message.To.map((to) => to.Address)),
  ).not.toContain("operator@tender.local");
  const detail = await messageDetail(messages[0]!.ID);
  expect(detail.Text).toContain("/approvals");
  expect(detail.Text).not.toMatch(/\b(cost|margin|threshold|reason|below)\b/i);
  await drainNow();
  expect(await messagesWithSubject(subject)).toHaveLength(rows.length);
});

test("an email whose quotation changed before sending is cancelled, not sent", async () => {
  test.setTimeout(120_000);
  const quote = provisionIssuedQuote({ notes: "P6 cancel fixture" });
  const address = uniqueAddress("cancel");
  queueBuyerEmailViaView(quote, address);
  beginSuccessorAndEdit(quote, { notes: "P6 cancel successor", quantity: 1 });
  const summary = await drainNow();
  expect(summary.cancelled).toBeGreaterThanOrEqual(1);
  expect(await messagesTo(address)).toHaveLength(0);
  const [row] = outboxFor(quote.quoteId).filter(
    (entry) => entry.kind === "quote_to_buyer",
  );
  expect(row).toMatchObject({
    status: "cancelled",
    last_error_code: "link_unavailable",
    share_link_id: null,
  });
  const { page } = operator;
  await page.goto(`/quotes/${quote.number}`);
  await expect(page.getByTestId("email-activity")).toContainText(
    "Not sent (quotation changed)",
  );
});

test("a failing mail server is retried with backoff, then dead-lettered and shown as Failed; nothing is delivered", async () => {
  test.setTimeout(300_000);
  const { apiUrl, anonKey } = localApi();
  // A second server whose SMTP port is closed. No test hook in production code.
  failingServer = spawn(
    "./node_modules/.bin/next",
    ["start", "-H", "localhost", "-p", "3100"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: apiUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
        TRACE_MAIL_PROVIDER: "smtp",
        TRACE_MAIL_SMTP_PORT: "1",
      },
      stdio: "ignore",
    },
  );
  const failingURL = "http://localhost:3100";
  await expect
    .poll(
      async () =>
        (
          await fetch(`${failingURL}/api/outbox/drain`).catch(() => ({
            status: 0,
          }))
        ).status,
      { timeout: 60_000 },
    )
    .toBe(405);

  const quote = provisionIssuedQuote({ notes: "P6 failure fixture" });
  const address = uniqueAddress("failing");
  queueBuyerEmailViaView(quote, address);
  const rowFor = () =>
    outboxFor(quote.quoteId).find((entry) => entry.kind === "quote_to_buyer")!;

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const result = await drainNow(failingURL);
    expect(result.claimed).toBeGreaterThanOrEqual(1);
    const row = rowFor();
    expect(row.attempts).toBe(attempt);
    expect(row.last_error_code).toBe("provider_unavailable");
    if (attempt < 6) {
      expect(row.status).toBe("retry_wait");
      // Backoff: not due again straight away.
      expect(
        Number(
          psql(
            `select count(*) from public.email_outbox where id = '${row.id}' and next_attempt_at > now() + interval '30 seconds'`,
          ),
        ),
      ).toBe(1);
      expect((await drainNow(failingURL)).claimed).toBe(0);
      psql(
        `update public.email_outbox set next_attempt_at = now() - interval '1 second' where id = '${row.id}'`,
      );
    }
  }
  const dead = rowFor();
  expect(dead).toMatchObject({
    status: "dead",
    attempts: 6,
    last_error_code: "provider_unavailable",
  });
  expect(dead.dead_at).not.toBeNull();
  expect(await messagesTo(address)).toHaveLength(0);
  // Six attempts minted six links; none is left live.
  expect(
    psql(
      `select count(*) filter (where disabled_at is null) || '/' || count(*) from public.quote_share_links where recipient_email = '${address}'`,
    ),
  ).toBe("0/6");
  expect(
    psql(
      `select count(*) from public.email_outbox_attempts where outbox_id = '${dead.id}'`,
    ),
  ).toBe("6");
  // Dead rows are never claimed again.
  expect((await drainNow(failingURL)).claimed).toBe(0);

  const { page } = operator;
  await page.goto(`/quotes/${quote.number}`);
  await expect(page.getByTestId("email-activity")).toContainText("Failed");
  await expect(page.getByTestId("email-activity")).toContainText(
    "The mail service was not reachable.",
  );
});
