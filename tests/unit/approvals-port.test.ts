// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ApprovalsTable,
  type ApprovalRow,
} from "@/components/approvals/approvals-table";

const { decide } = vi.hoisted(() => ({ decide: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(application)/approvals/actions", () => ({
  decideFromQueue: decide,
}));

let root: Root | undefined;
let host: HTMLDivElement;
async function render(canDecide = true) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(ApprovalsTable, { rows, canDecide }));
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});
const base: ApprovalRow = {
  id: "one",
  version: 1,
  number: "Q-1",
  href: "#one",
  customer: "Customer One",
  discount: "12%",
  threshold: "10%",
  total: "USD 50.00",
  waiting: "1 day",
  waitingIso: null,
  reasons: ["discount_above_threshold"],
  submitter: "Alice",
  revisionLabel: "Rev 1",
  diff: null,
  history: [],
  margin: null,
};
const rows: ApprovalRow[] = [
  base,
  {
    ...base,
    id: "two",
    number: "Q-2",
    customer: "Customer Two",
    submitter: "Bob",
    total: "USD 80.00",
    reasons: ["successor_revision"],
  },
];

test("filters only loaded rows, updates the selected panel, and clears back to the queue", async () => {
  await render();
  const select = host.querySelector<HTMLSelectElement>(
    'select[aria-label="Requested by"]',
  )!;
  await act(async () => {
    select.value = "Bob";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.querySelectorAll("tbody tr[aria-selected]")).toHaveLength(1);
  expect(
    host.querySelector('aside[aria-label="Decision panel"]')?.textContent,
  ).toContain("Customer Two");
  expect(
    host.querySelector('aside[aria-label="Decision panel"]')?.textContent,
  ).not.toContain("Customer One");
  const clear = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Clear filters",
  )!;
  await act(async () => {
    clear.click();
  });
  expect(host.querySelectorAll("tbody tr[aria-selected]")).toHaveLength(2);
});

test("read-only rows expose neither mutation buttons nor absent margin data", async () => {
  await render(false);
  expect(
    [...host.querySelectorAll("button")].some((button) =>
      /Approve quote|Reject quote/.test(button.textContent ?? ""),
    ),
  ).toBe(false);
  expect(
    host.querySelector('aside[aria-label="Decision panel"]')?.textContent,
  ).not.toContain("Margin after discount");
});

test("reject shortcut without a note focuses the note and does not call the server", async () => {
  await render();
  await act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "r", bubbles: true }),
    );
  });
  expect(host.textContent).toContain(
    "Add a note to reject — the requester sees it.",
  );
  expect(document.activeElement?.id).toBe("decision-note");
  expect(decide).not.toHaveBeenCalled();
});

test.each([true, false])(
  "Open quote is limited to deciders (%s) and the Decision column is absent",
  async (canDecide) => {
    await render(canDecide);
    const link = host.querySelector('aside a[aria-label="Open quote Q-1"]');
    expect(link !== null).toBe(canDecide);
    if (link) expect(link.getAttribute("href")).toBe("#one");
    expect(
      [...host.querySelectorAll("thead th")].map((th) =>
        th.textContent?.trim(),
      ),
    ).not.toContain("Decision");
    expect(host.querySelector("a.record-link")?.getAttribute("href")).toBe(
      "#one",
    );
  },
);
