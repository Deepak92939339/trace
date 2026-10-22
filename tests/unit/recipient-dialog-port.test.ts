// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AcceptanceDialog } from "@/components/public-quotes/recipient-quote-client";
let root: Root;
let host: HTMLDivElement;
const submit = vi.fn();
function Harness() {
  const [open, setOpen] = useState(false);
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { onClick: () => setOpen(true), id: "trigger" },
      "Open",
    ),
    createElement(AcceptanceDialog, {
      open,
      pending: false,
      status: "idle",
      statement: "Exact statement",
      onClose: () => setOpen(false),
      onSubmit: submit,
    }),
  );
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
  host.querySelector<HTMLButtonElement>("#trigger")!.focus();
  await act(async () =>
    host.querySelector<HTMLButtonElement>("#trigger")!.click(),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  submit.mockClear();
});
test("native dialog keeps autofocus, Tab trap, Escape and focus return", async () => {
  const dialog = host.querySelector("dialog")!;
  expect(dialog.hasAttribute("open")).toBe(true);
  expect(document.activeElement).toBe(dialog.querySelector("input"));
  const last = [...dialog.querySelectorAll("button")].at(-1)!;
  last.focus();
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(document.activeElement).toBe(dialog.querySelector("input"));
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(host.querySelector("dialog")).toBeNull();
  expect(document.activeElement?.id).toBe("trigger");
});
test("empty acceptance remains invalid and never reaches submission", async () => {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Enter a buyer-asserted name",
  );
  expect(submit).not.toHaveBeenCalled();
});

test.each(["throws", "unsupported"])(
  "dialog remains open and focused when showModal %s",
  async (failure) => {
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    if (failure === "throws")
      HTMLDialogElement.prototype.showModal = () => {
        throw new Error("Modal unavailable");
      };
    else
      Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    HTMLDialogElement.prototype.close = () => {
      throw new Error("Close unavailable");
    };
    await act(async () =>
      host.querySelector<HTMLButtonElement>("#trigger")!.click(),
    );
    const dialog = host.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.textContent).toContain("Exact statement");
    expect(document.activeElement).toBe(dialog.querySelector("input"));
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement?.id).toBe("trigger");
  },
);
