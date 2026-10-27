import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { psql, OUTSIDER, signIn } from "./p5-support";

// Fixtures use an independent fresh tenant, so bulk records cannot crowd seeded test lists.
// psql() verifies the loopback API, database port and Docker project identity before writing.
test("lists traverse 101 records and quote search reaches beyond the API row cap", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const marker = `lists-${randomBytes(6).toString("hex")}`;
  const email = `${marker}@example.test`;
  await page.goto("/create-account");
  await page.getByLabel("Full name", { exact: true }).fill("List test admin");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("TenderLocal1!");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel("Organization name", { exact: true }).fill(marker);
  await page.getByLabel("Workspace URL slug", { exact: true }).fill(marker);
  await page
    .getByRole("button", { name: "Create organization", exact: true })
    .click();
  await expect(page).toHaveURL(/\/quotes$/);

  const actor = psql(`select id from auth.users where email = '${email}'`);
  const org = psql(
    `select id from public.organizations where slug = '${marker}'`,
  );
  if (!/^[0-9a-f-]{36}$/.test(actor) || !/^[0-9a-f-]{36}$/.test(org))
    throw new Error("Fresh list fixture identity missing.");
  psql(`
    begin;
    set local role authenticated;
    set local request.jwt.claims = '{"sub":"${actor}","role":"authenticated"}';
    do $fixture$
    declare item jsonb; first_customer uuid; tax_id uuid;
    begin
      select id into tax_id from public.tax_profiles where organization_id = '${org}' and active order by id limit 1;
      for n in 1..101 loop
        item := public.create_customer('${org}', jsonb_build_object(
          'name', '${marker} ' || lpad(n::text, 3, '0'), 'contact_name', '', 'email', '', 'phone', '',
          'billing_address_line1', '', 'billing_address_line2', '', 'billing_city', '', 'billing_region', '',
          'billing_postal_code', '', 'billing_country_code', 'IN', 'locale', 'en-IN',
          'preferred_currency_code', 'INR', 'tax_treatment', 'standard', 'tax_identifier', null, 'active', true
        ), extensions.gen_random_uuid());
        if n = 1 then first_customer := (item->>'id')::uuid; end if;
        perform public.create_product('${org}', jsonb_build_object(
          'sku', '${marker}-' || lpad(n::text, 3, '0'), 'description', '${marker} product ' || n,
          'unit_code', 'EA', 'quantity_precision', 0, 'unit_price_minor', 100,
          'currency_code', 'INR', 'tax_profile_id', tax_id, 'active', true
        ), extensions.gen_random_uuid());
      end loop;
      for n in 1..1001 loop
        perform public.create_verified_quote_draft('${org}', first_customer, 'INR', 'en-IN',
          'Configured tax', 'exclusive', current_date, current_date + 30, extensions.gen_random_uuid());
      end loop;
    end $fixture$;
    commit;
  `);

  await page.goto(`/customers?q=${marker}`);
  await expect(
    page.getByRole("link", { name: `${marker} 001`, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(
    page.getByRole("link", { name: `${marker} 051`, exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(
    page.getByRole("link", { name: `${marker} 101`, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Next page", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Search customers", { exact: true })
    .fill(`${marker} 001`);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).not.toHaveURL(/page=/);
  await expect(
    page.getByRole("link", { name: `${marker} 001`, exact: true }),
  ).toBeVisible();

  await page.goto(`/catalog?q=${marker}&state=all&page=3`);
  await expect(page.getByText(`${marker}-101`, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Previous page", exact: true }).click();
  await expect(page).toHaveURL(/state=all.*page=2/);
  await expect(page.getByText(`${marker}-051`, { exact: true })).toBeVisible();

  await page.goto(`/quotes?q=${marker}&state=draft&page=21`);
  await expect(page.locator("a.record-link")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "Results pagination" }),
  ).toContainText("Showing 1001–1001");
  const number = await page.locator("a.record-link").innerText();
  await page.getByLabel("Search quotes", { exact: true }).fill(number);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).not.toHaveURL(/page=/);
  await expect(
    page.getByRole("link", { name: number, exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Search quotes", { exact: true })
    .fill("%,state.eq.issued)");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(
    page.getByText("No quotations match this view.", { exact: true }),
  ).toBeVisible();

  await signIn(page, OUTSIDER);
  await page.goto(`/quotes?q=${marker}&organization_id=${org}`);
  await expect(
    page.getByText("No quotations match this view.", { exact: true }),
  ).toBeVisible();
  await page.goto(`/customers?q=${marker}&page=3&organization_id=${org}`);
  await expect(
    page.getByText("No customers match this view.", { exact: true }),
  ).toBeVisible();
  await page.goto(`/catalog?q=${marker}&state=all&organization_id=${org}`);
  await expect(
    page.getByText("No catalog products match this view.", { exact: true }),
  ).toBeVisible();
});
