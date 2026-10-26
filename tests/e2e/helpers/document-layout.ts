import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { MANAGER, ORGANIZATION_ID, pdfContent, psql } from "../p5-support";

function asTemplateManager(sql: string) {
  return `begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"${MANAGER.id}","role":"authenticated"}';
${sql}
commit;`;
}

function clearCurrentLayout() {
  // psql verifies the exact disposable Docker project and loopback DB first.
  // There is no public "clear default" RPC. Only mutable fixture settings are
  // reset: immutable revision layouts, asset bytes and activity stay intact.
  psql(`update public.document_templates set is_default = false
    where organization_id = '${ORGANIZATION_ID}' and is_default;
    delete from public.organization_brand where organization_id = '${ORGANIZATION_ID}';`);
}

function activeTemplateIds(): string[] {
  return JSON.parse(
    psql(`select coalesce(json_agg(id), '[]'::json) from public.document_templates
      where organization_id = '${ORGANIZATION_ID}' and archived_at is null`),
  ) as string[];
}

/** Each test owns its layout choice; it never inherits another test's default. */
export function documentLayoutFixture(kind: "studio" | "legacy") {
  let existingTemplates = new Set<string>();

  test.beforeEach(() => {
    clearCurrentLayout();
    existingTemplates = new Set(activeTemplateIds());
    if (kind === "studio") {
      // Use the real capability-checked template commands and canonical Classic
      // layout, including x_of_y PDF margin-box page counters.
      psql(
        asTemplateManager(`select public.set_default_document_template(
          (public.duplicate_document_template('classic', 'E2E layout ${randomUUID()}')).id
        );`),
      );
    }
  });

  test.afterEach(() => {
    clearCurrentLayout();
    for (const id of activeTemplateIds()) {
      if (!existingTemplates.has(id)) {
        if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid template ID");
        // Archive this test's copies through the RPC, retaining versions/pins.
        psql(
          asTemplateManager(
            `select public.archive_document_template('${id}');`,
          ),
        );
      }
    }
    expect(
      psql(`select count(*) from public.document_templates
        where organization_id = '${ORGANIZATION_ID}' and is_default`),
      "the test must leave no organization default behind",
    ).toBe("0");
  });
}

/** Read the actual stored PDF; CSS margin counters are not DOM text nodes. */
export async function issuedStudioPdf(page: Page) {
  // Print media deliberately hides screen controls; read the link from the DOM
  // rather than requiring it to remain in the accessible print layout.
  const link = page.locator(
    'a[href^="/quotes/"][href*="/revisions/"][href$="/pdf"]',
  );
  await expect(link).toHaveCount(1);
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^\/quotes\/[^/]+\/revisions\/\d+\/pdf$/);
  const response = await page.request.get(href!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  const pdf = await pdfContent(new Uint8Array(await response.body()));
  expect(pdf.pages).toBe(pdf.perPage.length);
  for (const [index, text] of pdf.perPage.entries()) {
    const labels = text.match(/Page\s+\d+\s+of\s+\d+/g) ?? [];
    expect(
      labels.map((label) => label.replace(/\s+/g, " ")),
      `physical PDF page ${index + 1} has exactly its own k of N counter`,
    ).toEqual([`Page ${index + 1} of ${pdf.pages}`]);
  }
  await test.info().attach("studio-pagination.json", {
    body: Buffer.from(JSON.stringify({ pages: pdf.pages })),
    contentType: "application/json",
  });
  return pdf;
}
