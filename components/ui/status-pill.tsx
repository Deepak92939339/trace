import React from "react";
import {
  type QuoteState,
  quoteStateLabel,
} from "@/lib/quotes/effective-state";
import type { RecipientEventType } from "@/lib/quotes/commitment-contracts";
import styles from "./status-pill.module.css";

export type StatusPillState = QuoteState | "accepted";

export type StatusPillProps = {
  state: StatusPillState;
  buyerEvent?: RecipientEventType;
  className?: string;
  id?: string;
};

function formatStateLabel(state: StatusPillState): string {
  if (state === "accepted") return "Accepted";
  return quoteStateLabel(state);
}

function formatBuyerEventLabel(event: RecipientEventType): string {
  switch (event) {
    case "viewed":
      return "Viewed by buyer";
    case "change_requested":
      return "Changes requested";
    case "declined":
      return "Declined by buyer";
    case "accepted":
      return "Accepted by buyer";
  }
}

export function StatusPill({
  state,
  buyerEvent,
  className,
  id,
}: StatusPillProps) {
  const label = formatStateLabel(state);
  const pillClasses = [styles.pill, styles[state], className ?? ""]
    .filter(Boolean)
    .join(" ");

  if (buyerEvent) {
    return (
      <span className={styles.wrap} id={id}>
        <span className={pillClasses}>{label}</span>
        <span className={styles.buyer}>
          {formatBuyerEventLabel(buyerEvent)}
        </span>
      </span>
    );
  }

  return (
    <span className={pillClasses} id={id}>
      {label}
    </span>
  );
}
