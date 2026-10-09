#!/usr/bin/env node
/**
 * Regenerates the README screenshots in docs/images/screens/.
 *
 * It drives a RUNNING Trace instance through the UI the way a person would: it signs in as the
 * seeded manager and operator, creates fictional Indian B2B data (products with costs, customers,
 * a draft, a quote waiting for approval, an issued quote with a payment schedule and a share
 * link), then captures five images at 1440x900 @2x in light mode.
 *
 *   builder.png    draft builder with live preview and totals
 *   approvals.png  approvals queue with the decision drawer open
 *   proposal.png   buyer view of the issued quote (opened in a fresh browser context)
 *   pdf.png        page 1 of the issued quote's stored PDF, rendered at 2x
 *   landing.png    top 1440x900 of the public landing page
 *
 * Run it against a freshly reset, disposable LOCAL stack (`npm run db:reset`): it creates real
 * rows, and the product SKUs, customer names and quote numbers it uses are not de-duplicated
 * across runs. Build and start the app first (`npm run build`, then the local serve helper
 * `node --experimental-strip-types tests/e2e/recipient-local-fixture.ts --serve`, which also
 * starts the public-quote Edge broker and needs SUPABASE_SERVICE_ROLE_KEY in the shell). A
 * production build is required so no development badge is rendered.
 *
 * Environment (credentials are never stored in this file):
 *   CAPTURE_MANAGER_EMAIL / CAPTURE_MANAGER_PASSWORD     required, a manager in the demo org
 *   CAPTURE_OPERATOR_EMAIL / CAPTURE_OPERATOR_PASSWORD   required, an operator in the same org
 *   CAPTURE_BASE_URL   default http://localhost:3000
 *   CAPTURE_OUT_DIR    default docs/images/screens
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const required = [
  "CAPTURE_MANAGER_EMAIL",
  "CAPTURE_MANAGER_PASSWORD",
  "CAPTURE_OPERATOR_EMAIL",
  "CAPTURE_OPERATOR_PASSWORD",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Missing environment: ${missing.join(", ")}`);
  process.exit(2);
}

const baseUrl = (
  process.env.CAPTURE_BASE_URL ?? "http://localhost:3000"
).replace(/\/$/, "");
const outDir = resolve(process.env.CAPTURE_OUT_DIR ?? "docs/images/screens");
const manager = {
  email: process.env.CAPTURE_MANAGER_EMAIL,
  password: process.env.CAPTURE_MANAGER_PASSWORD,
};
const operator = {
  email: process.env.CAPTURE_OPERATOR_EMAIL,
  password: process.env.CAPTURE_OPERATOR_PASSWORD,
};

const viewport = { width: 1440, height: 900 };
const contextOptions = {
  viewport,
  deviceScaleFactor: 2,
  colorScheme: "light",
  reducedMotion: "reduce",
};

const FORBIDDEN = [
  { label: "Tender", test: (text) => /tender/i.test(text) },
  { label: "tender.local", test: (text) => /tender\.local/i.test(text) },
  { label: "fixture", test: (text) => /fixture/i.test(text) },
  { label: "ui-preview", test: (text) => /ui-preview/i.test(text) },
  { label: "B5", test: (text) => /\bB5\b/.test(text) },
  { label: "B8", test: (text) => /\bB8\b/.test(text) },
];

const PRODUCTS = [
  {
    sku: "MTR-450",
    description: "Induction motor 7.5 kW, IE3, foot mounted",
    unit: "EA",
    price: "58000",
    cost: "41500",
  },
  {
    sku: "VFD-075",
    description: "Variable frequency drive 7.5 kW, IP54",
    unit: "EA",
    price: "36500",
    cost: "26000",
  },
  {
    sku: "GBX-120",
    description: "Helical gearbox, 20:1 ratio, flange output",
    unit: "EA",
    price: "48500",
    cost: "35200",
  },
  {
    sku: "CBL-3C4",
    description: "Armoured control cable, 3 core 4 sq mm",
    unit: "M",
    price: "185",
    cost: "131",
  },
];

const CUSTOMERS = [
  {
    name: "Kaveri Auto Components Pvt Ltd",
    contactName: "Suresh Iyer",
    email: "procurement@kaveri-auto.example",
    phone: "+91 44 5550 0177",
    address: "27 SIDCO Industrial Estate",
    city: "Chennai",
    region: "Tamil Nadu",
    postal: "600058",
  },
  {
    name: "Rajputana Textiles Ltd",
    contactName: "Anjali Rathore",
    email: "buying@rajputana-textiles.example",
    phone: "+91 141 5550 0163",
    address: "9 Sitapura Industrial Area",
    city: "Jaipur",
    region: "Rajasthan",
    postal: "302022",
  },
];

const results = [];
const log = (message) => console.log(`[capture] ${message}`);

async function signIn(page, account) {
  await page.goto(`${baseUrl}/sign-in`);
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/quotes$/);
}

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

async function createProducts(page) {
  await page.goto(`${baseUrl}/catalog`);
  const existing = await page.locator("tbody tr td.mono").allInnerTexts();
  for (const product of PRODUCTS) {
    if (existing.includes(product.sku)) continue;
    await page.goto(`${baseUrl}/catalog`);
    await page.locator("summary", { hasText: "Create product" }).click();
    const form = page.locator("form.record-form");
    await form.locator('[name="sku"]').fill(product.sku);
    await form.locator('[name="description"]').fill(product.description);
    await form.locator('[name="unitCode"]').selectOption(product.unit);
    await form.locator('[name="unitPrice"]').fill(product.price);
    await form.locator('[name="unitCost"]').fill(product.cost);
    await form
      .locator('[name="taxProfileId"]')
      .selectOption({ label: "IN_GST18 — India GST 18% — demo configuration" });
    await form.getByRole("button", { name: "Create product" }).click();
    await form.getByRole("status").waitFor();
    log(`product ${product.sku}`);
  }
}

async function createCustomers(page) {
  for (const customer of CUSTOMERS) {
    await page.goto(`${baseUrl}/customers`);
    await page.locator("summary", { hasText: "Create customer" }).waitFor();
    if (await page.getByRole("link", { name: customer.name }).count()) continue;
    await page.locator("summary", { hasText: "Create customer" }).click();
    const form = page.locator("form.record-form");
    await form.locator('[name="name"]').fill(customer.name);
    await form.locator('[name="contactName"]').fill(customer.contactName);
    await form.locator('[name="email"]').fill(customer.email);
    await form.locator('[name="phone"]').fill(customer.phone);
    await form.locator('[name="billingAddressLine1"]').fill(customer.address);
    await form.locator('[name="billingCity"]').fill(customer.city);
    await form.locator('[name="billingRegion"]').fill(customer.region);
    await form.locator('[name="billingPostalCode"]').fill(customer.postal);
    await form.locator('[name="billingCountryCode"]').fill("IN");
    await form.locator('[name="locale"]').fill("en-IN");
    await form.locator('[name="preferredCurrencyCode"]').selectOption("INR");
    await form.locator('[name="taxTreatment"]').selectOption("standard");
    await form.getByRole("button", { name: /Create customer/ }).click();
    await form.getByRole("status").waitFor();
    log(`customer ${customer.name}`);
  }
}

async function waitForSaved(page) {
  await page
    .getByRole("status")
    .getByText("Saved", { exact: true })
    .waitFor({ timeout: 20_000 });
}

async function createDraft(
  page,
  { customer, lines, discount, freight, schedule },
) {
  await page.goto(`${baseUrl}/quotes/new`);
  await page.getByLabel("Customer").selectOption({ label: customer });
  await page.getByLabel("Currency").selectOption("INR");
  await page.getByRole("button", { name: "Create draft" }).click();
  await page.waitForURL(/\/quotes\/[A-Z]+-\d+-\d+$/);
  const number = page.url().split("/").pop();
  await page.getByRole("heading", { name: number }).waitFor();

  for (const line of lines) {
    const picker = page.getByLabel("Catalog product");
    const value = await picker
      .locator("option", { hasText: new RegExp(`^${line.sku} `) })
      .getAttribute("value");
    await picker.selectOption(value);
    await page.getByRole("button", { name: "Add product" }).click();
    const quantity = page.getByLabel(`Quantity for ${line.sku}`);
    await quantity.waitFor();
    await quantity.fill(line.quantity);
    await quantity.blur();
  }

  await page.getByLabel("Discount percent").fill(discount);
  await page.getByLabel("Discount percent").blur();

  await page.getByRole("button", { name: "Add charge" }).click();
  await page.getByLabel("Charge 1 type").selectOption("freight");
  const chargeTax = page.getByLabel("Charge 1 tax profile");
  await chargeTax.selectOption(
    await chargeTax
      .locator("option", { hasText: /^IN_GST18 / })
      .getAttribute("value"),
  );
  await page.getByLabel("Charge 1 description").fill(freight.description);
  await page.getByLabel("Charge 1 amount").fill(freight.amount);
  await page.getByLabel("Charge 1 amount").blur();

  await page
    .getByLabel("Commercial notes")
    .fill(
      "Prices are ex-works Pune. Delivery 4 weeks from the advance payment.",
    );

  await page.getByRole("button", { name: "Save draft" }).click();
  await waitForSaved(page);

  if (schedule) {
    await page.getByRole("button", { name: "Add payment schedule" }).click();
    for (let n = 1; n <= schedule.length; n += 1) {
      if (n > 1)
        await page.getByRole("button", { name: "Add milestone" }).click();
      const [label, share, trigger] = schedule[n - 1];
      await page.getByLabel(`Milestone ${n} label`).fill(label);
      await page.getByLabel(`Milestone ${n} share`).fill(share);
      await page.getByLabel(`Milestone ${n} share`).blur();
      await page.getByLabel(`Milestone ${n} trigger`).selectOption(trigger);
    }
    await savePaymentSchedule(page);
  }
  return number;
}

async function savePaymentSchedule(page) {
  const section = page.locator("section.quote-payment-schedule");
  await section.getByRole("button", { name: "Save schedule" }).click();
  // Saved once the button is back to "Save schedule" and disabled (nothing left to save).
  await page.waitForFunction(
    () => {
      const button = [
        ...document.querySelectorAll("section.quote-payment-schedule button"),
      ].find((node) =>
        /^(Save schedule|Saving…)$/.test(node.textContent.trim()),
      );
      return Boolean(
        button &&
        button.disabled &&
        button.textContent.trim() === "Save schedule",
      );
    },
    undefined,
    { timeout: 20_000 },
  );
}

async function visibleTextCheck(page, name) {
  const text = await page.evaluate(() => document.body.innerText);
  const hits = FORBIDDEN.filter((rule) => rule.test(text)).map(
    (rule) => rule.label,
  );
  results.push({ name, hits });
  if (hits.length)
    throw new Error(`${name}: forbidden visible text: ${hits.join(", ")}`);
}

async function save(page, name, options = {}) {
  await settle(page);
  await visibleTextCheck(page, name);
  const target = join(outDir, name);
  await page.screenshot({ path: target, ...options });
  log(`saved ${name}`);
}

async function workflow(page, buttonName) {
  const button = page.getByRole("button", { name: buttonName }).first();
  await button.waitFor();
  await button.click();
}

async function waitForState(page, label) {
  await page
    .locator("main")
    .getByText(label, { exact: true })
    .first()
    .waitFor({ timeout: 20_000 });
}

async function createShareLink(page, recipientEmail) {
  await page.getByLabel("Recipient email").fill(recipientEmail);
  await page.getByRole("button", { name: "Create recipient link" }).click();
  const open = page.getByRole("link", { name: "Open link" });
  await open.waitFor({ timeout: 30_000 });
  return open.getAttribute("href");
}

async function renderPdfPage1(pdfBytes) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(pdfBytes) });
  try {
    const shot = await parser.getScreenshot({
      partial: [1],
      scale: 2,
      imageBuffer: true,
      imageDataUrl: false,
    });
    return Buffer.from(shot.pages[0].data);
  } finally {
    await parser.destroy();
  }
}

async function optimizePng(buffer) {
  const { default: sharp } = await import("sharp");
  return sharp(buffer)
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toBuffer();
}

const MAX_BYTES = 900 * 1024;
const browser = await chromium.launch({ headless: true });
try {
  mkdirSync(outDir, { recursive: true });

  // Manager: catalog with internal costs, customers, and the draft shown in the builder.
  const managerContext = await browser.newContext(contextOptions);
  const managerPage = await managerContext.newPage();
  await signIn(managerPage, manager);
  await createProducts(managerPage);
  await createCustomers(managerPage);

  const draftNumber = await createDraft(managerPage, {
    customer: "Asha Engineering Works",
    lines: [
      { sku: "MTR-450", quantity: "4" },
      { sku: "VFD-075", quantity: "4" },
      { sku: "GBX-120", quantity: "2" },
      { sku: "CBL-3C4", quantity: "120" },
    ],
    discount: "6",
    freight: {
      description: "Freight to Pune, road transport",
      amount: "18500",
    },
    schedule: [
      ["Advance on order", "40", "on_acceptance"],
      ["Before dispatch", "40", "on_delivery"],
      ["On commissioning", "20", "on_completion"],
    ],
  });
  log(`draft ${draftNumber}`);

  // Operator: a quote over the 10% discount limit, submitted so it waits for a manager.
  const operatorContext = await browser.newContext(contextOptions);
  const operatorPage = await operatorContext.newPage();
  await signIn(operatorPage, operator);
  const waitingNumber = await createDraft(operatorPage, {
    customer: "Kaveri Auto Components Pvt Ltd",
    lines: [
      { sku: "GBX-120", quantity: "6" },
      { sku: "MTR-450", quantity: "6" },
      { sku: "VFD-075", quantity: "6" },
    ],
    discount: "15",
    freight: {
      description: "Freight to Chennai, road transport",
      amount: "24000",
    },
    schedule: [
      ["Advance on order", "50", "on_acceptance"],
      ["Before dispatch", "50", "on_delivery"],
    ],
  });
  await workflow(operatorPage, "Submit for decision");
  await waitForState(operatorPage, "Waiting for approval");
  log(`waiting ${waitingNumber}`);

  // Manager: a quote inside the limit, approved on submit, issued, and shared.
  const issuedNumber = await createDraft(managerPage, {
    customer: "Rajputana Textiles Ltd",
    lines: [
      { sku: "MTR-450", quantity: "8" },
      { sku: "GBX-120", quantity: "8" },
      { sku: "CBL-3C4", quantity: "250" },
    ],
    discount: "5",
    freight: {
      description: "Freight to Jaipur, road transport",
      amount: "21000",
    },
    schedule: [
      ["Advance on order", "40", "on_acceptance"],
      ["Before dispatch", "40", "on_delivery"],
      ["On commissioning", "20", "on_completion"],
    ],
  });
  await workflow(managerPage, "Submit for decision");
  await workflow(managerPage, "Issue quote");
  await waitForState(managerPage, "Issued");
  log(`issued ${issuedNumber}`);
  const shareUrl = await createShareLink(
    managerPage,
    "buying@rajputana-textiles.example",
  );
  log("share link created");

  // 1. builder: the draft, scrolled to the live preview and its totals.
  await managerPage.goto(`${baseUrl}/quotes/${draftNumber}`);
  await managerPage.getByText("Live preview — not issued").waitFor();
  await managerPage.mouse.move(720, 450);
  const previewTop = await managerPage.evaluate(
    () =>
      [...document.querySelectorAll("*")]
        .find((e) => e.textContent?.trim() === "Live preview — not issued")
        ?.getBoundingClientRect().top + window.scrollY,
  );
  await managerPage.evaluate((y) => window.scrollTo(0, y - 24), previewTop);
  await save(managerPage, "builder.png");

  // 2. approvals: the waiting quote selected with its decision drawer open.
  await managerPage.goto(`${baseUrl}/approvals`);
  await managerPage
    .getByRole("link", { name: waitingNumber })
    .first()
    .waitFor();
  const drawer = managerPage.getByRole("complementary", {
    name: "Decision panel",
  });
  await drawer.waitFor();
  await drawer.getByText(waitingNumber).first().waitFor();
  await save(managerPage, "approvals.png");

  // 3. proposal: the buyer's view in a fresh context (no staff session).
  const buyerContext = await browser.newContext(contextOptions);
  const buyerPage = await buyerContext.newPage();
  await buyerPage.goto(new URL(shareUrl, baseUrl).href);
  await buyerPage.getByText(issuedNumber).first().waitFor({ timeout: 30_000 });
  // The totals and payment schedule sit below the header and first lines; scroll them into view.
  await buyerPage.getByRole("heading", { name: "Payment schedule" }).waitFor();
  const scopeTop = await buyerPage.evaluate(
    () =>
      [...document.querySelectorAll("h2")]
        .find((e) => e.textContent?.trim() === "Scope and price")
        .getBoundingClientRect().top + window.scrollY,
  );
  await buyerPage.evaluate((y) => window.scrollTo(0, y), scopeTop + 24);
  await save(buyerPage, "proposal.png");
  await buyerContext.close();

  // 4. pdf: page 1 of the stored PDF for the issued revision.
  const pdfResponse = await managerContext.request.get(
    `${baseUrl}/quotes/${issuedNumber}/revisions/1/pdf`,
  );
  if (!pdfResponse.ok())
    throw new Error(`PDF request failed: ${pdfResponse.status()}`);
  const pdfBytes = await pdfResponse.body();
  const { PDFParse } = await import("pdf-parse");
  const textParser = new PDFParse({ data: new Uint8Array(pdfBytes) });
  const pdfText = (await textParser.getText({ partial: [1] })).text;
  await textParser.destroy();
  const pdfHits = FORBIDDEN.filter((rule) => rule.test(pdfText)).map(
    (rule) => rule.label,
  );
  results.push({ name: "pdf.png", hits: pdfHits });
  if (pdfHits.length)
    throw new Error(`pdf.png: forbidden text: ${pdfHits.join(", ")}`);
  writeFileSync(join(outDir, "pdf.png"), await renderPdfPage1(pdfBytes));
  log("saved pdf.png");

  // 5. landing: the public page, top 1440x900 only, with no session.
  const landingContext = await browser.newContext(contextOptions);
  const landingPage = await landingContext.newPage();
  await landingPage.goto(`${baseUrl}/`);
  await save(landingPage, "landing.png", { fullPage: false });
  await landingContext.close();
} finally {
  await browser.close();
}

for (const name of [
  "builder.png",
  "approvals.png",
  "proposal.png",
  "pdf.png",
  "landing.png",
]) {
  const target = join(outDir, name);
  const optimized = await optimizePng(readFileSync(target));
  writeFileSync(target, optimized);
  if (optimized.length >= MAX_BYTES) {
    throw new Error(
      `${name} is ${optimized.length} bytes; the limit is ${MAX_BYTES}`,
    );
  }
  const check = results.find((entry) => entry.name === name);
  console.log(
    `${name}: ${(optimized.length / 1024).toFixed(0)} KB, forbidden text: ${
      check && !check.hits.length ? "none found" : "NOT CHECKED"
    }`,
  );
}
