"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Money } from "@/components/ui/money";
import styles from "./math-popover.module.css";

export type MathLine = {
  key: string;
  label: string;
  /** Pre-formatted working, e.g. "4 EA × 1,250.00". Built by the caller from snapshot values. */
  detail: string;
  amountMinor: number;
};

export type MathAdjustment = {
  key: string;
  label: string;
  /** Signed minor units as produced by the calculator (discount negative). */
  amountMinor: number;
};

export type MathPopoverProps = {
  currency: string;
  lines: MathLine[];
  adjustments: MathAdjustment[];
  totalMinor: number;
  locale?: string;
  triggerLabel?: string;
  footnote?: string;
  align?: "start" | "end";
};

const DEFAULT_FOOTNOTE =
  "Calculated per line, rounded half-up, in integer minor units. The server recalculates and must match.";

/** "Show the math": every line, every adjustment, the total. Display only — values come from the calculator. */
export function MathPopover({
  currency,
  lines,
  adjustments,
  totalMinor,
  locale,
  triggerLabel = "Show the math",
  footnote = DEFAULT_FOOTNOTE,
  align = "end",
}: MathPopoverProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className={styles.wrap}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2.5" y="1.5" width="11" height="13" rx="1.5" />
          <path
            d="M5 4.5h6M5 8h1.5M9.5 8H11M5 11h1.5M9.5 11H11"
            strokeLinecap="round"
          />
        </svg>
        {triggerLabel}
      </button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Calculation"
          className={[styles.panel, styles[align]].join(" ")}
        >
          <table className={styles.table}>
            <tbody>
              {lines.map((line) => (
                <tr key={line.key}>
                  <th scope="row">
                    <span className={styles.label}>{line.label}</span>
                    <span className={styles.detail}>{line.detail}</span>
                  </th>
                  <td>
                    <Money
                      minor={line.amountMinor}
                      currency={currency}
                      locale={locale}
                      showCurrency={false}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
              {adjustments.map((adjustment) => (
                <tr key={adjustment.key} className={styles.adjustment}>
                  <th scope="row">{adjustment.label}</th>
                  <td>
                    <Money
                      minor={adjustment.amountMinor}
                      currency={currency}
                      locale={locale}
                      showCurrency={false}
                      size="sm"
                    />
                  </td>
                </tr>
              ))}
              <tr className={styles.total}>
                <th scope="row">Total</th>
                <td>
                  <Money
                    minor={totalMinor}
                    currency={currency}
                    locale={locale}
                    size="sm"
                  />
                </td>
              </tr>
            </tbody>
          </table>
          <p className={styles.footnote}>{footnote}</p>
        </div>
      ) : null}
    </span>
  );
}
