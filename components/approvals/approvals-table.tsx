"use client";

import Link from "next/link";
import React, { useState, useEffect, useCallback } from "react";
import { EmptyState, ReadOnlyNotice } from "@/components/states";
import { ReasonChip } from "@/components/ui/reason-chip";
import { StatusPill } from "@/components/ui/status-pill";
import type { HistoryTimelineEvent } from "@/components/quotes/history-timeline";
import { DecisionDrawer } from "./decision-drawer";
import styles from "./approvals-table.module.css";

export type ApprovalDiffRow = {
  key: string;
  label: string;
  before: string | null;
  after: string | null;
  delta: string | null;
  direction: "up" | "down" | null;
};

export type ApprovalMargin = {
  value: string;
  floor: string | null;
  tone: "red" | "amber" | "green";
  linesWithoutCost: number;
  percent: number;
  floorPercent: number | null;
};

export type ApprovalRow = {
  id: string;
  version: number;
  number: string;
  href: string;
  customer: string | null;
  discount: string;
  threshold: string | null;
  total: string;
  waiting: string;
  waitingIso: string | null;
  reasons: string[];
  submitter: string | null;
  revisionLabel: string;
  diff: ApprovalDiffRow[] | null;
  history: HistoryTimelineEvent[];
  margin?: ApprovalMargin | null;
};

export type ApprovalsTableProps = {
  rows: ApprovalRow[];
  canDecide: boolean;
};

export function ApprovalsTable({ rows, canDecide }: ApprovalsTableProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [decidedMap, setDecidedMap] = useState<
    Record<string, "approved" | "rejected">
  >({});

  const safeIndex =
    rows.length > 0
      ? selectedIndex < rows.length
        ? selectedIndex
        : rows.length - 1
      : -1;

  const selectedRow = safeIndex >= 0 ? rows[safeIndex] : null;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const activeEl = document.activeElement;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        if (
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select" ||
          activeEl.hasAttribute("contenteditable")
        ) {
          return;
        }
      }
      const key = e.key.toLowerCase();
      if (key === "j") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev < rows.length - 1 ? prev + 1 : prev));
      } else if (key === "k") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [rows.length]);

  const handleDecisionSuccess = useCallback(
    (quoteId: string, state: "approved" | "rejected") => {
      setDecidedMap((prev) => {
        const next = { ...prev, [quoteId]: state };
        const nextIndex = rows.findIndex(
          (r, idx) => idx !== safeIndex && !next[r.id],
        );
        if (nextIndex !== -1) {
          setSelectedIndex(nextIndex);
        }
        return next;
      });
    },
    [rows, safeIndex],
  );

  return (
    <section className={`destination-page approvals-page ${styles.container}`}>
      <header className={`destination-header ${styles.header}`}>
        <div>
          <p className={`eyebrow ${styles.eyebrow}`}>Decision queue</p>
          <h1 className={styles.title}>Approvals</h1>
          <p className={styles.sub}>
            Quotations above their submission-time approval threshold wait here.
          </p>
        </div>
        {rows.length > 0 && (
          <span className={styles.count}>{rows.length} waiting</span>
        )}
      </header>

      {!canDecide && (
        <ReadOnlyNotice className={styles.notice}>
          This account can see its organization’s commercial state but cannot
          approve or reject. Decision controls appear only for capable signed
          users.
        </ReadOnlyNotice>
      )}

      <div className={styles.layout}>
        <div
          className={`table-region ${styles.tableRegion}`}
          tabIndex={0}
          role="region"
          aria-label="Approvals queue table"
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Quotation</th>
                <th className={styles.wideOnly}>Customer</th>
                <th>Discount</th>
                <th className={styles.r}>Total</th>
                <th className={styles.wideOnly}>Why it&apos;s here</th>
                <th className={styles.wideOnly}>Submitted by</th>
                <th>Waiting</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const isSelected = index === safeIndex;
                const decidedState = decidedMap[row.id];

                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    role="row"
                    aria-selected={isSelected}
                    onClick={() => setSelectedIndex(index)}
                    onKeyDown={(e) => {
                      if (
                        (e.key === "Enter" || e.key === " ") &&
                        e.target === e.currentTarget
                      ) {
                        e.preventDefault();
                        setSelectedIndex(index);
                      }
                    }}
                  >
                    <td data-label="Quotation">
                      <Link
                        className={`record-link mono ${styles.recordLink}`}
                        href={row.href}
                      >
                        {row.number}
                      </Link>
                    </td>
                    <td data-label="Customer" className={styles.wideOnly}>
                      <span className={styles.customer}>
                        {row.customer || "—"}
                      </span>
                    </td>
                    <td data-label="Discount">
                      <div>
                        <span
                          className={
                            row.threshold !== null
                              ? styles.discountOver
                              : styles.discount
                          }
                        >
                          {row.discount}
                        </span>
                        <small className={styles.limitText}>
                          {row.threshold !== null
                            ? `limit ${row.threshold}`
                            : "no limit recorded"}
                        </small>
                      </div>
                    </td>
                    <td
                      data-label="Total"
                      className={`${styles.r} ${styles.num}`}
                    >
                      {row.total}
                    </td>
                    <td data-label="Why it's here" className={styles.wideOnly}>
                      <div className={styles.reasonsList}>
                        {row.reasons.length > 0 ? (
                          row.reasons.map((code) => (
                            <ReasonChip key={code} code={code} />
                          ))
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Submitted by" className={styles.wideOnly}>
                      <span className={styles.submittedBy}>
                        {row.submitter || "—"}
                      </span>
                    </td>
                    <td data-label="Waiting">
                      {decidedState ? (
                        <StatusPill state={decidedState} />
                      ) : row.waitingIso ? (
                        <time className={styles.time} dateTime={row.waitingIso}>
                          {row.waiting}
                        </time>
                      ) : (
                        <span className={styles.time}>{row.waiting}</span>
                      )}
                    </td>
                    <td data-label="Decision">
                      {decidedState ? null : canDecide ? (
                        <Link
                          className={`button ${styles.button}`}
                          href={row.href}
                        >
                          Inspect decision
                        </Link>
                      ) : (
                        <span className={styles.managerText}>
                          Manager decision required
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className={`table-empty ${styles.empty}`}>
                    <EmptyState
                      icon="check"
                      title="No quotations are waiting for approval."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && selectedRow && (
          <DecisionDrawer
            key={selectedRow.id}
            quote={selectedRow}
            canDecide={canDecide}
            decidedState={decidedMap[selectedRow.id]}
            onDecisionSuccess={handleDecisionSuccess}
          />
        )}
      </div>
    </section>
  );
}
