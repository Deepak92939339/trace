import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  clearRenderAttempts,
  OPERATOR,
  pdfContent,
  provisionIssuedQuote,
  signIn,
  type IssuedQuote,
} from "./p5-support";

// Proves the page model against real output. For every scenario the stored PDF (the same bytes a
// customer receives) must have exactly as many physical pages as the quote page has .print-page
// articles, page k must say "Page k of N", and nothing may be dropped or truncated.
test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

test.beforeAll(async ({ browser }, testInfo) => {
  if (testInfo.project.name !== "desktop-chrome") return;
  context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL as string,
  });
  page = await context.newPage();
  await signIn(page, OPERATOR);
});

test.afterAll(async () => {
  await context?.close();
});

test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chrome",
    "Covered once in desktop Chrome.",
  );
});

const LOREM = "lorem ipsum dolor sit amet ";
const longNotes = LOREM.repeat(Math.ceil(5000 / LOREM.length)).slice(0, 5000);
const SELLER = "Trace Demo Industries";
const CUSTOMER = "Asha Engineering Works";
const DESCRIPTION = "Precision coupling assembly";

type Scenario = {
  items: number;
  milestones: number;
  charges: number;
  notes: string;
};

const scenarios: Scenario[] = [];
for (const items of [1, 14, 40])
  for (const milestones of [0, 3, 12])
    for (const charges of [0, 5])
      scenarios.push({ items, milestones, charges, notes: "Short note." });
// Long notes (the 5,000-character limit) on the heaviest and lightest shapes.
scenarios.push(
  { items: 1, milestones: 3, charges: 0, notes: longNotes },
  { items: 14, milestones: 12, charges: 5, notes: longNotes },
  { items: 40, milestones: 12, charges: 5, notes: longNotes },
);

function count(haystack: string, needle: string) {
  return haystack.split(needle).length - 1;
}

for (const scenario of scenarios) {
  const label = `${scenario.items} items, ${scenario.milestones} milestones, ${scenario.charges} charges, ${
    scenario.notes === longNotes ? "5000-character notes" : "short notes"
  }`;
  test(`PDF pages equal .print-page articles and carry their own "Page k of N": ${label}`, async () => {
    test.setTimeout(180_000);
    const quote: IssuedQuote = provisionIssuedQuote({
      notes: scenario.notes,
      lines: scenario.items,
      milestones: scenario.milestones || undefined,
      charges: scenario.charges,
    });
    clearRenderAttempts();

    // The same PDF route as P5.
    const response = await context.request.get(
      `/quotes/${encodeURIComponent(quote.number)}/revisions/1/pdf?format=json`,
    );
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { url: string };
    const bytes = new Uint8Array(
      await (await context.request.get(body.url)).body(),
    );
    const pdf = await pdfContent(bytes);

    // The browser print of the same quote.
    await page.goto(`/quotes/${quote.number}`);
    await page.emulateMedia({ media: "print" });
    await page.locator(".print-document").waitFor({ state: "visible" });
    const articles = await page.locator(".print-page").count();
    const footers = await page.locator(".print-page footer").allInnerTexts();
    await page.emulateMedia({ media: "screen" });

    expect(articles).toBeGreaterThanOrEqual(1);
    expect(pdf.pages, "physical PDF pages == .print-page articles").toBe(
      articles,
    );
    expect(pdf.perPage).toHaveLength(articles);

    pdf.perPage.forEach((text, index) => {
      const k = index + 1;
      const collapsed = text.replace(/\s+/g, " ");
      expect(collapsed, `page ${k} says its own number`).toContain(
        `Page ${k} of ${articles}`,
      );
      // No other page number appears on that page.
      for (let other = 1; other <= articles; other += 1)
        if (other !== k)
          expect(collapsed).not.toContain(`Page ${other} of ${articles}`);
      expect(footers[index]!.replace(/\s+/g, " ")).toContain(
        `Page ${k} of ${articles}`,
      );
      expect(collapsed).toContain(k === articles ? "Final page" : "Continued");
      if (k === 1) {
        // Seller and customer in full on page 1, once.
        expect(collapsed).toContain(SELLER);
        expect(collapsed).toContain(CUSTOMER);
        expect(collapsed).toContain("Commercial quotation");
      } else {
        // Continued pages: a compact header with the number and revision, no parties.
        expect(collapsed).toContain(`${quote.number} · Revision 1`);
        expect(collapsed).not.toContain(SELLER);
        expect(collapsed).not.toContain(CUSTOMER);
      }
    });

    // Nothing dropped or truncated, nothing duplicated.
    const all = pdf.collapsed;
    expect(count(all, DESCRIPTION), "every item description, in full").toBe(
      scenario.items,
    );
    expect(count(all, "Subtotal"), "one totals block").toBe(1);
    expect(
      count(all, "Issuance does not mean delivery."),
      "one closing line",
    ).toBe(1);
    for (let k = 1; k <= scenario.milestones; k += 1)
      expect(count(all, `Milestone ${k} `), `milestone ${k}`).toBe(1);
    for (let k = 1; k <= scenario.charges; k += 1)
      expect(count(all, `Handling charge ${k} `), `charge ${k}`).toBe(1);
    if (scenario.notes === longNotes)
      expect(count(all, "lorem"), "every word of the notes").toBe(
        count(longNotes, "lorem"),
      );
    else expect(all).toContain("Short note.");
    if (scenario.milestones > 0) expect(all).toContain("Payment schedule");
    expect(all).not.toMatch(
      /\b(sent|emailed|paid|received|pending|overdue)\b/i,
    );
  });
}
