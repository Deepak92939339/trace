// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vitest";
import { ProductStage } from "@/components/landing/product-stage";

let root: Root;
let host: HTMLDivElement;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
});
test("hero edits recalculate the live specimen, invalid inputs do not retain a stale total, and reset restores it", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(ProductStage)));
  const original = host.querySelector(
    '[data-testid="hero-total"]',
  )!.textContent;
  const input = host.querySelector<HTMLInputElement>(
    'input[aria-label="Hero quantity"]',
  )!;
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    set.call(input, "4");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(
    host.querySelector('[data-testid="hero-total"]')!.textContent,
  ).not.toBe(original);
  await act(async () => {
    set.call(input, "invalid");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(host.querySelector('[data-testid="hero-total"]')).toBeNull();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  const reset = [...host.querySelectorAll("button")].find(
    (button) => button.textContent === "Reset",
  )!;
  await act(async () => reset.click());
  expect(host.querySelector('[data-testid="hero-total"]')!.textContent).toBe(
    original,
  );
});
