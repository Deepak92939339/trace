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

test("only Reason and Requested by filter loaded approvals", async () => {
  await render();
  expect(
    [...host.querySelectorAll("select")].map((select) =>
      select.getAttribute("aria-label"),
    ),
  ).toEqual(["Reason", "Requested by"]);
  const reason = host.querySelector<HTMLSelectElement>(
    'select[aria-label="Reason"]',
  )!;
  await act(async () => {
    reason.value = "successor_revision";
    reason.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.querySelectorAll("tbody tr[aria-selected]")).toHaveLength(1);
  expect(
    host.querySelector('aside[aria-label="Decision panel"]')?.textContent,
  ).toContain("Customer Two");
});

function press(key: string, init: KeyboardEventInit = {}) {
  return act(async () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
  });
}
function selectedNumber() {
  return host
    .querySelector('aside[aria-label="Decision panel"]')
    ?.textContent?.match(/Q-\d/)?.[0];
}

test("J and K move the selection, stop at the ends, and ignore modifiers and form fields", async () => {
  await render();
  expect(selectedNumber()).toBe("Q-1");
  await press("k");
  expect(selectedNumber()).toBe("Q-1");
  await press("j", { ctrlKey: true });
  await press("j", { metaKey: true });
  await press("j", { altKey: true });
  expect(selectedNumber()).toBe("Q-1");
  const field = document.createElement("input");
  host.append(field);
  field.focus();
  await press("j");
  expect(selectedNumber()).toBe("Q-1");
  field.blur();
  field.remove();
  await press("j");
  expect(selectedNumber()).toBe("Q-2");
  await press("J");
  expect(selectedNumber()).toBe("Q-2");
  await press("k");
  expect(selectedNumber()).toBe("Q-1");
});

test("A approves the selected quote once; modifiers, form fields and held keys never reach the server", async () => {
  decide.mockResolvedValue({ status: "ok" });
  await render();
  await press("a", { ctrlKey: true });
  await press("a", { metaKey: true });
  await press("a", { altKey: true });
  await press("a", { repeat: true });
  const note = host.querySelector<HTMLTextAreaElement>("#decision-note")!;
  note.focus();
  await press("a");
  expect(decide).not.toHaveBeenCalled();
  note.blur();
  await press("a");
  expect(decide).toHaveBeenCalledTimes(1);
  expect(decide).toHaveBeenCalledWith(
    expect.objectContaining({
      quoteId: "one",
      expectedVersion: 1,
      decision: "approve",
    }),
  );
});

test("a reviewer pressing A or R never reaches the server and sees no reject-note prompt", async () => {
  await render(false);
  await press("a");
  await press("r");
  expect(decide).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain("Add a note to reject");
});

test("R with a note rejects with that note", async () => {
  decide.mockResolvedValue({ status: "ok" });
  await render();
  const note = host.querySelector<HTMLTextAreaElement>("#decision-note")!;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!;
    set.call(note, "Discount is too deep");
    note.dispatchEvent(new Event("input", { bubbles: true }));
  });
  note.blur();
  await press("r");
  expect(decide).toHaveBeenCalledWith(
    expect.objectContaining({
      decision: "reject",
      reason: "Discount is too deep",
    }),
  );
});
