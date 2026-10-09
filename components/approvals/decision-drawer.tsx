"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ReasonChip } from "@/components/ui/reason-chip";
import { Chip } from "@/components/ui/chip";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { ConflictBanner } from "@/components/states";
import { HistoryTimeline } from "@/components/quotes/history-timeline";
import { decideFromQueue } from "@/app/(application)/approvals/actions";
import type { ApprovalRow } from "./approvals-table";
import styles from "./decision-drawer.module.css";

const REASON_EXPLANATIONS: Record<string, string> = {
  discount_above_threshold:
    "The discount is above your organization's approval limit.",
  successor_revision:
    "This is a new revision of a quotation the buyer already received.",
  legacy_adoption:
    "This revision was carried over from a quotation created before revisions existed.",
  below_cost: "Sells below cost.",
  margin_under_floor: "Margin is under your floor.",
};

export type DecisionDrawerProps = {
  quote: ApprovalRow;
  canDecide: boolean;
  decidedState?: "approved" | "rejected";
  onDecisionSuccess: (id: string, decision: "approved" | "rejected") => void;
};

export function DecisionDrawer({
  quote,
  canDecide,
  decidedState,
  onDecisionSuccess,
}: DecisionDrawerProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);

  const executeDecision = useCallback(
    async (decision: "approve" | "reject") => {
      setIsPending(true);
      setStaleMessage(null);
      setFailedMessage(null);

      try {
        const result = await decideFromQueue({
          quoteId: quote.id,
          expectedVersion: quote.version,
          decision,
          reason: note.trim() || undefined,
        });

        if (result.status === "ok") {
          onDecisionSuccess(
            quote.id,
            decision === "approve" ? "approved" : "rejected",
          );
          setNote("");
          setNoteError(null);
          router.refresh();
        } else if (result.status === "stale") {
          setStaleMessage(
            result.message || "This quotation was modified by another user.",
          );
        } else {
          setFailedMessage(result.message || "Unable to complete decision.");
        }
      } catch (err: unknown) {
        setFailedMessage(
          err instanceof Error ? err.message : "An unexpected error occurred.",
        );
      } finally {
        setIsPending(false);
      }
    },
    [note, quote.id, quote.version, onDecisionSuccess, router],
  );

  const handleApprove = useCallback(() => {
    if (isPending) return;
    executeDecision("approve");
  }, [isPending, executeDecision]);

  const handleReject = useCallback(() => {
    if (isPending) return;
    if (note.trim().length < 3) {
      setNoteError("Add a note to reject — the requester sees it.");
      const el = document.getElementById("decision-note");
      if (el) el.focus();
      return;
    }
    executeDecision("reject");
  }, [isPending, note, executeDecision]);

  useEffect(() => {
    if (!canDecide || decidedState || isPending) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
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
      if (key === "a") {
        e.preventDefault();
        handleApprove();
      } else if (key === "r") {
        e.preventDefault();
        handleReject();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canDecide, decidedState, isPending, handleApprove, handleReject]);

  return (
    <aside
      className={styles.drawer}
      aria-busy={isPending ? "true" : undefined}
      aria-label="Decision panel"
    >
      {/* a. Header */}
      <div className={styles.header}>
        <div className={styles.idRow}>
          <span className={`mono ${styles.quoteNumber}`}>{quote.number}</span>
          <StatusPill state={decidedState ?? "waiting"} />
          <span className={styles.revisionChip}>{quote.revisionLabel}</span>
        </div>
        <h2 className={styles.customer}>{quote.customer || "—"}</h2>
        <p className={styles.submitted}>
          Submitted by {quote.submitter || "—"}
        </p>
        <div className={styles.totalRow}>
          <span className={styles.totalLabel}>Total</span>
          <span className={`num ${styles.totalValue}`}>{quote.total}</span>
        </div>
      </div>

      {/* b. Why it's here */}
      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Why it&apos;s here</h3>
        <div className={styles.reasonsList}>
          {quote.reasons.map((code) => {
            const sentence = REASON_EXPLANATIONS[code];
            return (
              <div key={code} className={styles.reasonItem}>
                {sentence ? (
                  <ReasonChip code={code} />
                ) : (
                  <Chip tone="neutral">
                    <span className="mono">{code}</span>
                  </Chip>
                )}
                {sentence ? (
                  <p className={styles.reasonSentence}>{sentence}</p>
                ) : null}
              </div>
            );
          })}
          {quote.reasons.length === 0 && (
            <p className={styles.emptyNotice}>No reasons recorded.</p>
          )}
        </div>
      </div>

      {/* Margin */}
      {quote.margin && (
        <div className={styles.section}>
          <h3 className={styles.sectionHeading}>Margin</h3>
          <div className={styles.marginDisplay}>
            <span
              className={`${styles.marginValue} ${
                styles[`marginTone_${quote.margin.tone}`]
              }`}
            >
              {quote.margin.value}
            </span>
            <span className={styles.marginFloor}>
              {quote.margin.floor ? `Floor ${quote.margin.floor}` : "No floor"}
            </span>
          </div>
          <div
            className={styles.marginMeter}
            style={
              {
                "--margin-pct": `${quote.margin.percent}%`,
                ...(quote.margin.floorPercent !== null
                  ? { "--floor-pct": `${quote.margin.floorPercent}%` }
                  : {}),
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            <div
              className={`${styles.marginTrackFill} ${
                styles[`marginFill_${quote.margin.tone}`]
              }`}
            />
            {quote.margin.floorPercent !== null && (
              <div className={styles.marginFloorTick} />
            )}
          </div>
          {quote.margin.linesWithoutCost > 0 && (
            <p className={styles.marginExcludedNote}>
              {quote.margin.linesWithoutCost} line
              {quote.margin.linesWithoutCost === 1 ? "" : "s"} without cost —
              excluded
            </p>
          )}
        </div>
      )}

      {/* c. What changed */}
      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>What changed</h3>
        {quote.diff === null ? (
          <p className={styles.diffNotice}>
            First revision — nothing to compare
          </p>
        ) : quote.diff.length === 0 ? (
          <p className={styles.diffNotice}>
            No commercial changes from the previous revision.
          </p>
        ) : (
          <table className={styles.diffTable}>
            <tbody>
              {quote.diff.map((row) => (
                <tr key={row.key}>
                  <td className={styles.diffLabel}>{row.label}</td>
                  <td className={`num ${styles.diffBefore}`}>
                    {row.before ?? "—"}
                  </td>
                  <td className={styles.diffArrow} aria-hidden="true">
                    →
                  </td>
                  <td className={`num ${styles.diffAfter}`}>
                    {row.after ?? "—"}
                  </td>
                  <td
                    className={`num ${styles.diffDelta} ${
                      row.direction === "up"
                        ? styles.deltaUp
                        : row.direction === "down"
                          ? styles.deltaDown
                          : ""
                    }`}
                  >
                    {row.delta ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* d. Activity */}
      <div className={styles.section}>
        <h3 className={styles.sectionHeading}>Activity</h3>
        <HistoryTimeline events={quote.history} />
      </div>

      {/* e. Decision (only when canDecide and not yet decided) */}
      {canDecide && !decidedState && (
        <div className={styles.decisionSection}>
          {staleMessage && (
            <ConflictBanner
              title="Quotation changed"
              body={staleMessage}
              className={styles.conflictBanner}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setStaleMessage(null);
                    router.refresh();
                  }}
                >
                  Reload queue
                </Button>
              }
            />
          )}

          {failedMessage && (
            <div className={styles.failedBanner}>
              <p className={styles.failedTitle}>Decision failed</p>
              <p className={styles.failedBody}>{failedMessage}</p>
            </div>
          )}

          <div className={styles.noteGroup}>
            <label htmlFor="decision-note" className={styles.noteLabel}>
              Decision note
            </label>
            <textarea
              id="decision-note"
              className={`${styles.noteTextarea} ${
                noteError ? styles.noteTextareaError : ""
              }`}
              placeholder="Optional for approve, required for reject."
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                if (noteError && e.target.value.trim().length >= 3) {
                  setNoteError(null);
                }
              }}
              disabled={isPending}
            />
            {noteError && (
              <p className={styles.noteErrorText} id="decision-note-error">
                {noteError}
              </p>
            )}
          </div>

          <div className={styles.decisionActions}>
            <Button
              variant="danger"
              disabled={isPending}
              onClick={handleReject}
              className={styles.decisionBtn}
            >
              Reject quote
              <span aria-hidden="true" className={styles.kbdWrap}>
                <Kbd>R</Kbd>
              </span>
            </Button>
            <Button
              variant="primary"
              disabled={isPending}
              onClick={handleApprove}
              className={styles.decisionBtn}
            >
              Approve quote
              <span aria-hidden="true" className={styles.kbdWrap}>
                <Kbd>A</Kbd>
              </span>
            </Button>
          </div>
        </div>
      )}
    </aside>
  );
}
