import { expect, test } from "@playwright/test";
import {
  CUSTOMER,
  MANAGER,
  ORGANIZATION_ID,
  OPERATOR,
  PRODUCT,
  REVIEWER,
  asOperator,
  psql,
  savePayload,
  signIn,
} from "./p5-support";

test.describe.configure({ mode: "serial" });
test.use({ trace: "off", screenshot: "off", video: "off" });

let number = "";
let draftNumber = "";

test.beforeAll(() => {
  psql(
    `update public.products set unit_cost_minor = 2000 where id = '${PRODUCT}'`,
  );
  number = psql(
    asOperator(`
do $f$
declare created jsonb; q uuid; r uuid;
begin
  created := public.create_verified_quote_draft('${ORGANIZATION_ID}', '${CUSTOMER}',
    'INR','en-IN','GST 18%','exclusive', current_date, current_date + 30, extensions.gen_random_uuid());
  q := (created->>'id')::uuid; r := (created->>'current_revision_id')::uuid;
  perform public.save_quote_draft(q, 1, extensions.gen_random_uuid(), ${savePayload("UI port guard fixture", 3, 1, 0, 1500)});
  perform public.submit_quote_revision(q, r, (select version from public.quotes where id = q), extensions.gen_random_uuid());
  create temporary table guard_fixture(number text) on commit drop;
  insert into guard_fixture select number from public.quotes where id = q;
end $f$;
select number from guard_fixture;`),
  )
    .split("\n")
    .pop()!
    .trim();
  expect(number).toMatch(/^TND-/);
  draftNumber = psql(
    asOperator(`
do $f$
declare created jsonb; q uuid;
begin
  created := public.create_verified_quote_draft('${ORGANIZATION_ID}', '${CUSTOMER}',
    'INR','en-IN','GST 18%','exclusive', current_date, current_date + 30, extensions.gen_random_uuid());
  q := (created->>'id')::uuid;
  perform public.save_quote_draft(q, 1, extensions.gen_random_uuid(), ${savePayload("UI port guard draft", 3, 1, 0, 0)});
  create temporary table guard_draft(number text) on commit drop;
  insert into guard_draft select number from public.quotes where id = q;
end $f$;
select number from guard_draft;`),
  )
    .split("\n")
    .pop()!
    .trim();
  expect(draftNumber).toMatch(/^TND-/);
});

test.afterAll(() => {
  psql(
    `update public.products set unit_cost_minor = null where id = '${PRODUCT}'`,
  );
});

test("a manager sees margin and decision controls; a reviewer (no margin.read) sees neither anywhere", async ({
  browser,
}) => {
  const manager = await (await browser.newContext()).newPage();
  await signIn(manager, MANAGER);
  await manager.goto("/approvals");
  await manager
    .getByRole("row", { name: new RegExp(number) })
    .locator("td")
    .nth(1)
    .click();
  const panel = manager.locator('aside[aria-label="Decision panel"]');
  await expect(panel).toContainText("Margin after discount");
  await expect(
    manager.getByRole("button", { name: /Approve quote/ }),
  ).toBeVisible();
  await manager.goto(`/quotes/${draftNumber}`);
  await expect(
    manager.getByText("Margin", { exact: true }).first(),
  ).toBeVisible();
  await manager.context().close();

  const reviewerContext = await browser.newContext();
  const reviewer = await reviewerContext.newPage();
  await signIn(reviewer, REVIEWER);
  for (const path of [
    "/approvals",
    `/quotes/${number}`,
    `/quotes/${draftNumber}`,
  ]) {
    await reviewer.goto(path);
    await expect(reviewer.getByRole("heading", { level: 1 })).toBeVisible();
    const body = reviewer.locator("body");
    await expect(body).not.toContainText(/margin/i);
    await expect(body).not.toContainText(/unit cost/i);
    for (const name of [/Approve/, /Reject/, /Accept/]) {
      await expect(reviewer.getByRole("button", { name })).toHaveCount(0);
    }
  }
  // Keyboard shortcuts must not mutate for a reviewer either.
  await reviewer.goto("/approvals");
  await reviewer.keyboard.press("a");
  await reviewer.keyboard.press("r");
  await expect(reviewer.getByText(/Add a note to reject/)).toHaveCount(0);
  await reviewerContext.close();
});

test("the operator who submitted a quote cannot decide it and sees no decision shortcuts act", async ({
  page,
}) => {
  await signIn(page, OPERATOR);
  await page.goto(`/quotes/${number}`);
  await expect(page.getByRole("button", { name: "Approve quote" })).toHaveCount(
    0,
  );
});
