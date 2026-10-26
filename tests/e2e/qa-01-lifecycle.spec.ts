import { documentLayoutFixture } from "./helpers/document-layout";
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import { execSync } from "child_process";
import { json, ORGANIZATION_ID } from "./p5-support";

documentLayoutFixture("studio");

test("qa-01: complete quote lifecycle and print validation", async ({
  page,
  browser,
}) => {
  // 1. Operator logs in and creates a draft
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill("operator@tender.local");
  await page.getByLabel("Password").fill("TenderLocal1!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/quotes$/);

  await page.getByRole("link", { name: "Create quote" }).click();
  await page
    .getByLabel("Customer")
    .selectOption({ label: "Asha Engineering Works" });
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/quotes\/TND-\d{4}-\d{4,}$/);

  // Add line items
  await page
    .getByLabel("Catalog product")
    .selectOption({ label: "SFR-310 — Stainless feed rail" });
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByLabel("Quantity for SFR-310").fill("1.250");
  await expect(
    page.locator(".save-indicator").getByText("Saved", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  const quoteUrl = page.url();

  // Set discount to trigger manager approval (>10%)
  await page.getByLabel("Discount percent").fill("15");
  await expect(
    page.locator(".save-indicator").getByText("Saved", { exact: true }),
  ).toBeVisible({ timeout: 20_000 });

  // 2. Submit for approval
  await page.getByRole("button", { name: /Submit for decision/ }).click();
  await expect(page.locator(".state-label")).toHaveText(
    "Waiting for approval",
    { timeout: 20_000 },
  );

  // 3. Manager approves
  const managerContext = await browser.newContext();
  const managerPage = await managerContext.newPage();
  await managerPage.goto("/sign-in");
  await managerPage.getByLabel("Email address").fill("manager@tender.local");
  await managerPage.getByLabel("Password").fill("TenderLocal1!");
  await managerPage.getByRole("button", { name: "Sign in" }).click();
  await expect(managerPage).toHaveURL(/\/quotes$/);

  await managerPage.goto(quoteUrl);
  await managerPage.getByRole("button", { name: "Approve quote" }).click();
  await expect(managerPage.locator(".state-label")).toHaveText("Approved", {
    timeout: 20_000,
  });
  await managerContext.close();

  // 4. Operator issues the quote
  await page.reload();
  await expect(page.locator(".state-label")).toHaveText("Approved", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Issue quote" }).click();
  await expect(page.locator(".state-label")).toHaveText("Issued", {
    timeout: 20_000,
  });

  // 5. Save PDF and assert against extracted text
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".studio-document")).toBeVisible();

  const pdfPath = "qa-runs/verified/artifacts/pdfs/qa-01-issued.pdf";
  if (!fs.existsSync("qa-runs/verified/artifacts/pdfs")) {
    fs.mkdirSync("qa-runs/verified/artifacts/pdfs", { recursive: true });
  }
  await page.pdf({ path: pdfPath });

  const textContent = execSync(`npx -y pdf-parse text "${pdfPath}"`).toString();

  // 1. Matches TND-\d{4}-\d{4}
  expect(textContent).toMatch(/TND-\d{4}-\d{4}/);

  // Known wording issue: Studio currently prints "Total INR INR …" because
  // both the label and formatted amount include INR. Do not change the renderer here.
  const total = textContent.match(
    /\bTotal\s+([A-Z]{3})\s+([A-Z]{3})\s+([1-9][\d,]*\.\d{2})/,
  );
  expect(
    total,
    "Studio total must include its currency and a non-zero amount",
  ).not.toBeNull();
  const number = decodeURIComponent(
    new URL(quoteUrl).pathname.split("/").at(-1)!,
  );
  expect(number).toMatch(/^TND-\d{4}-\d+$/);
  const issued = json<{ currency: string; minor: string }>(
    `select json_build_object('currency', currency_code, 'minor', total_minor::text)
      from public.quotes where organization_id = '${ORGANIZATION_ID}' and number = '${number}'`,
  );
  expect(issued.currency).toBe("INR");
  expect(total![1]).toBe(issued.currency);
  expect(total![2]).toBe(issued.currency);
  const printedMinor = BigInt(total![3]!.replace(/[,.]/g, ""));
  expect(printedMinor).toBeGreaterThan(0n);
  expect(printedMinor).toBe(BigInt(issued.minor));

  // 3. Does NOT contain "Select a customer" or "Create draft"
  expect(textContent).not.toContain("Select a customer");
  expect(textContent).not.toContain("Create draft");
});
