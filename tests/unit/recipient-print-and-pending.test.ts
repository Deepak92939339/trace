// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AcceptanceDialog } from "@/components/public-quotes/recipient-quote-client";
import { AcceptanceReceipt } from "@/components/proposal/acceptance-receipt";
import {
  portAcceptance as acceptance,
  portQuote as quote,
} from "@/app/ui-preview/port-proposal-fixtures";

let root: Root;
let host: HTMLDivElement;
const onClose = vi.fn();
beforeEach(() => {
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
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  onClose.mockClear();
  document.documentElement.removeAttribute("data-print-record");
});

test("Escape while a request is pending is swallowed (never reaches the native close request) and does not close", async () => {
  await act(async () =>
    root.render(
      createElement(AcceptanceDialog, {
        open: true,
        pending: true,
        status: "idle",
        statement: "Exact statement",
        onClose,
        onSubmit: vi.fn(),
      }),
    ),
  );
  const escape = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  await act(async () => document.dispatchEvent(escape));
  expect(escape.defaultPrevented).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  const dialog = host.querySelector("dialog")!;
  const cancel = new Event("cancel", { cancelable: true });
  await act(async () => dialog.dispatchEvent(cancel));
  expect(cancel.defaultPrevented).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  expect(dialog.hasAttribute("open")).toBe(true);
});

test("only the receipt's Print this record button marks the page for receipt-only printing", async () => {
  const print = vi.fn(() => {
    expect(document.documentElement.hasAttribute("data-print-record")).toBe(
      true,
    );
  });
  vi.stubGlobal("print", print);
  await act(async () =>
    root.render(createElement(AcceptanceReceipt, { acceptance, quote })),
  );
  expect(document.documentElement.hasAttribute("data-print-record")).toBe(
    false,
  );
  const button = [...host.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === "Print this record",
  )!;
  await act(async () => button.click());
  expect(print).toHaveBeenCalledTimes(1);
  await act(async () => {
    window.dispatchEvent(new Event("afterprint"));
  });
  expect(document.documentElement.hasAttribute("data-print-record")).toBe(
    false,
  );
  vi.unstubAllGlobals();
});
