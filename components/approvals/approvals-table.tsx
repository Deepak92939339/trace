"use client";

import Link from "next/link";
import React, {
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
} from "react";
import { EmptyState, ReadOnlyNotice } from "@/components/states";
import { ReasonChip } from "@/components/ui/reason-chip";
import { Kbd } from "@/components/ui/kbd";
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

function subscribeClock(onChange: () => void) {
  const timer = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(timer);
}
function clockSnapshot() {
  return Math.floor(Date.now() / 60_000);
}
function serverClockSnapshot() {
  return null;
}
function relativeWaiting(
  iso: string | null,
  fallback: string,
  minute: number | null,
) {
  if (!iso || minute === null) return fallback;
  const elapsed = minute * 60_000 - Date.parse(iso);
  if (!Number.isFinite(elapsed)) return fallback;
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export function ApprovalsTable({ rows, canDecide }: ApprovalsTableProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [decidedMap, setDecidedMap] = useState<
    Record<string, "approved" | "rejected">
  >({});

  const [reason, setReason] = useState("");
  const [submitter, setSubmitter] = useState("");
  const minute = useSyncExternalStore(
    subscribeClock,
    clockSnapshot,
    serverClockSnapshot,
  );
  const visibleRows = rows.filter(
    (row) =>
      (!reason || row.reasons.includes(reason)) &&
      (!submitter || row.submitter === submitter),
  );
  const pendingRows = rows.filter((row) => !decidedMap[row.id]);
  const oldest = pendingRows.reduce<ApprovalRow | null>((oldest, row) => {
    if (!row.waitingIso || !Number.isFinite(Date.parse(row.waitingIso)))
      return oldest;
    return !oldest?.waitingIso ||
      Date.parse(row.waitingIso) < Date.parse(oldest.waitingIso)
      ? row
      : oldest;
  }, null);

  const safeIndex =
    visibleRows.length > 0
      ? selectedIndex < visibleRows.length
        ? selectedIndex
        : visibleRows.length - 1
      : -1;

  const selectedRow = safeIndex >= 0 ? visibleRows[safeIndex] : null;

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
        setSelectedIndex((prev) =>
          prev < visibleRows.length - 1 ? prev + 1 : prev,
        );
      } else if (key === "k") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visibleRows.length]);

  const handleDecisionSuccess = useCallback(
    (quoteId: string, state: "approved" | "rejected") => {
      setDecidedMap((prev) => {
        const next = { ...prev, [quoteId]: state };
        const nextIndex = visibleRows.findIndex(
          (r, idx) => idx !== safeIndex && !next[r.id],
        );
        if (nextIndex !== -1) {
          setSelectedIndex(nextIndex);
        }
        return next;
      });
    },
    [visibleRows, safeIndex],
  );

  return (
    <section className={`destination-page approvals-page ${styles.container}`}>
      {!canDecide && (
        <ReadOnlyNotice className={styles.notice}>
          This account can see its organization’s commercial state but cannot
          approve or reject. Decision controls appear only for capable signed
          users.
        </ReadOnlyNotice>
      )}

      <div className={styles.layout}>
        <div className={styles.list}>
          <header className={`destination-header ${styles.header}`}>
            <div>
              <p className={`eyebrow ${styles.eyebrow}`}>Decision queue</p>
              <h1 className={styles.title}>Approvals</h1>
              <p className={styles.sub}>
                {pendingRows.length} waiting
                {oldest
                  ? ` · oldest ${relativeWaiting(oldest.waitingIso, oldest.waiting, minute)}`
                  : ""}
                <span className={styles.queueHint}>
                  Quotations above their submission-time approval threshold wait
                  here.
                </span>
              </p>
            </div>
          </header>
          <div
            className={styles.filters}
            role="group"
            aria-label="Filter loaded approvals"
          >
            <label className={styles.filterChip}>
              <span>
                {reason ? `Reason: ${reason.replaceAll("_", " ")}` : "+ Reason"}
              </span>
              <select
                aria-label="Reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setSelectedIndex(0);
                }}
              >
                <option value="">All reasons</option>
                {[...new Set(rows.flatMap((row) => row.reasons))]
                  .sort()
                  .map((code) => (
                    <option key={code} value={code}>
                      {code.replaceAll("_", " ")}
                    </option>
                  ))}
              </select>
            </label>
            <label className={styles.filterChip}>
              <span>{submitter ? `By: ${submitter}` : "+ Requested by"}</span>
              <select
                aria-label="Requested by"
                value={submitter}
                onChange={(event) => {
                  setSubmitter(event.target.value);
                  setSelectedIndex(0);
                }}
              >
                <option value="">Everyone</option>
                {[
                  ...new Set(
                    rows.flatMap((row) =>
                      row.submitter ? [row.submitter] : [],
                    ),
                  ),
                ]
                  .sort()
                  .map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
              </select>
            </label>
            {(reason || submitter) && (
              <button
                className={styles.clearFilter}
                type="button"
                onClick={() => {
                  setReason("");
                  setSubmitter("");
                  setSelectedIndex(0);
                }}
              >
                Clear filters
              </button>
            )}
            <span className={styles.keyboardHint}>
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> Move
            </span>
          </div>
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
                  <th>Customer</th>
                  <th className={styles.r}>Discount</th>
                  <th className={styles.r}>Total</th>
                  <th>Why it&apos;s here</th>
                  <th aria-label="Submitted by">By</th>
                  <th>Waiting</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
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
                        <small className={styles.rowRevision}>
                          {row.revisionLabel}
                        </small>
                      </td>
                      <td data-label="Customer">
                        <span className={styles.customer}>
                          {row.customer || "—"}
                        </span>
                      </td>
                      <td data-label="Discount" className={styles.r}>
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
                      <td data-label="Why it's here">
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
                      <td data-label="Submitted by">
                        <span className={styles.submittedBy}>
                          {row.submitter || "—"}
                        </span>
                      </td>
                      <td data-label="Waiting">
                        {decidedState ? (
                          <StatusPill state={decidedState} />
                        ) : row.waitingIso ? (
                          <time
                            className={styles.time}
                            dateTime={row.waitingIso}
                          >
                            {relativeWaiting(
                              row.waitingIso,
                              row.waiting,
                              minute,
                            )}
                          </time>
                        ) : (
                          <span className={styles.time}>
                            {relativeWaiting(
                              row.waitingIso,
                              row.waiting,
                              minute,
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className={`table-empty ${styles.empty}`}>
                      <EmptyState
                        icon="check"
                        title={
                          rows.length === 0
                            ? "No quotations are waiting for approval."
                            : "No quotations match these filters."
                        }
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {visibleRows.length > 0 && selectedRow && (
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
