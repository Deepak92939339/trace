"use client";

import React from "react";
import type { QuoteState } from "@/lib/quotes/effective-state";
import type { RecipientEventType } from "@/lib/quotes/commitment-contracts";
import { StatusPill } from "@/components/ui/status-pill";
import { Chip } from "@/components/ui/chip";
import styles from "./page-header.module.css";

export type PageHeaderProps = {
  quoteId?: string;
  statusState?: QuoteState | "accepted";
  buyerEvent?: RecipientEventType;
  revChip?: string | React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function PageHeader({
  quoteId,
  statusState,
  buyerEvent,
  revChip,
  title,
  subtitle,
  rightSlot,
  className,
}: PageHeaderProps) {
  const headClasses = [styles.pageHead, className ?? ""].filter(Boolean).join(" ");

  const hasMeta = Boolean(quoteId || statusState || revChip);

  return (
    <div className={headClasses}>
      <div className={styles.left}>
        {hasMeta && (
          <div className={styles.qid}>
            {quoteId && <span className={styles.mono}>{quoteId}</span>}
            {statusState && (
              <StatusPill state={statusState} buyerEvent={buyerEvent} />
            )}
            {revChip &&
              (typeof revChip === "string" ? (
                <Chip tone="rev">{revChip}</Chip>
              ) : (
                revChip
              ))}
          </div>
        )}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.sub}>{subtitle}</p>}
      </div>

      {rightSlot && <div className={styles.right}>{rightSlot}</div>}
    </div>
  );
}
