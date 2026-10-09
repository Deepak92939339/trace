"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MAX_PAYMENT_MILESTONES,
  allocateMilestoneAmounts,
  validatePaymentMilestones,
  type PaymentMilestoneInput,
  type PaymentTrigger,
} from "@/lib/quotes/payment-schedule";
import {
  bpsToPercentInput,
  formatBasisPoints,
  parsePercentToBps,
} from "@/lib/formatting/basis-points";
import { formatMinor } from "@/lib/formatting/money";
import { savePaymentSchedule } from "@/app/(application)/quotes/[number]/payment-schedule-actions";
import { ConflictBanner } from "@/components/states/conflict-banner";
import styles from "./payment-schedule-editor.module.css";

type MilestoneRowState = {
  key: string;
  label: string;
  shareText: string;
  basisPoints: number;
  shareError: string | null;
  trigger: PaymentTrigger;
  dueDate: string | null;
};

export type PaymentScheduleEditorProps = {
  quoteId: string;
  expectedVersion: number;
  issueDate: string;
  totalMinor: number;
  currencyCode: string;
  locale: string;
  initialSchedule?: PaymentMilestoneInput[];
  editable?: boolean;
  isDraftSaving?: boolean;
  isDraftDirty?: boolean;
  onVersionBump?: (version: number) => void;
  onScheduleChange?: (
    milestones: PaymentMilestoneInput[],
    isValid: boolean,
  ) => void;
};

function createInitialRows(
  schedule: readonly PaymentMilestoneInput[] | undefined,
): MilestoneRowState[] {
  if (!schedule || schedule.length === 0) return [];
  return schedule.map((item, index) => ({
    key: `milestone-${index}-${item.label}-${item.basis_points}`,
    label: item.label,
    shareText: bpsToPercentInput(item.basis_points),
    basisPoints: item.basis_points,
    shareError: null,
    trigger: item.trigger,
    dueDate: item.trigger === "on_date" ? item.due_date : null,
  }));
}

export function PaymentScheduleEditor({
  quoteId,
  expectedVersion,
  issueDate,
  totalMinor,
  currencyCode,
  locale,
  initialSchedule,
  editable = false,
  isDraftSaving = false,
  isDraftDirty = false,
  onVersionBump,
  onScheduleChange,
}: PaymentScheduleEditorProps) {
  const router = useRouter();
  const [rows, setRows] = useState<MilestoneRowState[]>(() =>
    createInitialRows(initialSchedule),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isScheduleSaving, setIsScheduleSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [staleMessage, setStaleMessage] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Basis points sum
  const totalBps = useMemo(() => {
    let sum = 0;
    for (const row of rows) {
      if (row.shareError === null && row.basisPoints > 0) {
        sum += row.basisPoints;
      }
    }
    return sum;
  }, [rows]);

  // Prepared milestone inputs for validation & saving
  const milestoneInputs: PaymentMilestoneInput[] = useMemo(() => {
    return rows.map((row) => ({
      label: row.label,
      basis_points: row.basisPoints,
      trigger: row.trigger,
      due_date: row.trigger === "on_date" ? row.dueDate : null,
    }));
  }, [rows]);

  // Validation
  const validationError = useMemo(() => {
    if (rows.length === 0) return null;
    const hasRowError = rows.some((r) => r.shareError !== null);
    if (hasRowError) return "Please enter a valid percentage for each share.";
    return validatePaymentMilestones(milestoneInputs, issueDate);
  }, [rows, milestoneInputs, issueDate]);

  // Sync to parent builder for DocumentPreview
  useEffect(() => {
    const isValid =
      rows.length > 0 && totalBps === 10000 && validationError === null;
    onScheduleChange?.(milestoneInputs, isValid);
  }, [
    milestoneInputs,
    totalBps,
    validationError,
    onScheduleChange,
    rows.length,
  ]);

  // Live amounts
  const amounts = useMemo(() => {
    if (totalBps !== 10000 || totalMinor <= 0 || rows.length === 0) {
      return null;
    }
    const hasShareError = rows.some(
      (r) => r.shareError !== null || r.basisPoints < 1,
    );
    if (hasShareError) return null;
    try {
      return allocateMilestoneAmounts(
        totalMinor,
        rows.map((r) => r.basisPoints),
      );
    } catch {
      return null;
    }
  }, [totalBps, totalMinor, rows]);

  // Reset confirm remove after 5 seconds
  useEffect(() => {
    if (!confirmRemove) return;
    const timer = setTimeout(() => {
      setConfirmRemove(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [confirmRemove]);

  // Add initial milestone
  const handleAddInitial = useCallback(() => {
    const initialRow: MilestoneRowState = {
      key: `milestone-${Date.now()}-0`,
      label: "On acceptance",
      shareText: "100",
      basisPoints: 10000,
      shareError: null,
      trigger: "on_acceptance",
      dueDate: null,
    };
    setRows([initialRow]);
    setIsDirty(true);
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  // Add another milestone
  const handleAddRow = useCallback(() => {
    if (rows.length >= MAX_PAYMENT_MILESTONES) return;
    const nextIndex = rows.length + 1;
    const newRow: MilestoneRowState = {
      key: `milestone-${Date.now()}-${nextIndex}`,
      label: `Milestone ${nextIndex}`,
      shareText: "",
      basisPoints: 0,
      shareError: null,
      trigger: "on_delivery",
      dueDate: null,
    };
    setRows((prev) => [...prev, newRow]);
    setIsDirty(true);
    setSaveMessage(null);
    setSaveError(null);
  }, [rows.length]);

  // Row edit handlers
  const handleLabelChange = useCallback((index: number, newLabel: string) => {
    setRows((prev) => {
      const next = [...prev];
      const target = next[index];
      if (target) {
        next[index] = { ...target, label: newLabel };
      }
      return next;
    });
    setIsDirty(true);
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const handleShareChange = useCallback(
    (index: number, newShareText: string) => {
      setRows((prev) => {
        const next = [...prev];
        const target = next[index];
        if (target) {
          next[index] = { ...target, shareText: newShareText };
        }
        return next;
      });
      setIsDirty(true);
      setSaveMessage(null);
      setSaveError(null);
    },
    [],
  );

  const handleShareBlur = useCallback((index: number) => {
    setRows((prev) => {
      const next = [...prev];
      const target = next[index];
      if (!target) return prev;
      const parsed = parsePercentToBps(target.shareText);
      if (parsed === null || parsed < 1 || parsed > 10000) {
        next[index] = {
          ...target,
          basisPoints: 0,
          shareError: "Enter a valid percentage (e.g. 25, 33.33).",
        };
      } else {
        next[index] = {
          ...target,
          basisPoints: parsed,
          shareText: bpsToPercentInput(parsed),
          shareError: null,
        };
      }
      return next;
    });
  }, []);

  const handleTriggerChange = useCallback(
    (index: number, newTrigger: PaymentTrigger) => {
      setRows((prev) => {
        const next = [...prev];
        const target = next[index];
        if (target) {
          next[index] = {
            ...target,
            trigger: newTrigger,
            dueDate:
              newTrigger === "on_date" ? (target.dueDate ?? issueDate) : null,
          };
        }
        return next;
      });
      setIsDirty(true);
      setSaveMessage(null);
      setSaveError(null);
    },
    [issueDate],
  );

  const handleDueDateChange = useCallback((index: number, newDate: string) => {
    setRows((prev) => {
      const next = [...prev];
      const target = next[index];
      if (target) {
        next[index] = { ...target, dueDate: newDate || null };
      }
      return next;
    });
    setIsDirty(true);
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setRows((prev) => {
      const next = [...prev];
      const current = next[index];
      const above = next[index - 1];
      if (current && above) {
        next[index - 1] = current;
        next[index] = above;
      }
      return next;
    });
    setIsDirty(true);
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setRows((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const current = next[index];
      const below = next[index + 1];
      if (current && below) {
        next[index + 1] = current;
        next[index] = below;
      }
      return next;
    });
    setIsDirty(true);
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  const handleRemoveRow = useCallback((index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
    setSaveMessage(null);
    setSaveError(null);
  }, []);

  // Save schedule action
  const handleSaveSchedule = useCallback(async () => {
    if (
      isScheduleSaving ||
      isDraftSaving ||
      isDraftDirty ||
      validationError !== null
    ) {
      return;
    }
    setIsScheduleSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    setStaleMessage(null);

    const result = await savePaymentSchedule({
      quoteId,
      expectedVersion,
      issueDate,
      milestones: milestoneInputs,
    });

    setIsScheduleSaving(false);

    if (result.status === "ok") {
      onVersionBump?.(result.version);
      setSaveMessage(result.message);
      setIsDirty(false);
    } else if (result.status === "stale") {
      setStaleMessage(result.message);
    } else {
      setSaveError(result.message);
    }
  }, [
    isScheduleSaving,
    isDraftSaving,
    isDraftDirty,
    validationError,
    quoteId,
    expectedVersion,
    issueDate,
    milestoneInputs,
    onVersionBump,
  ]);

  // Remove schedule action (empty array)
  const handleRemoveScheduleClick = useCallback(async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setIsScheduleSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    setStaleMessage(null);

    const result = await savePaymentSchedule({
      quoteId,
      expectedVersion,
      issueDate,
      milestones: [],
    });

    setIsScheduleSaving(false);
    setConfirmRemove(false);

    if (result.status === "ok") {
      onVersionBump?.(result.version);
      setRows([]);
      setIsDirty(false);
      setSaveMessage(result.message);
    } else if (result.status === "stale") {
      setStaleMessage(result.message);
    } else {
      setSaveError(result.message);
    }
  }, [confirmRemove, quoteId, expectedVersion, issueDate, onVersionBump]);

  // Read-only presentation when not editable
  if (!editable) {
    return (
      <section
        className={`quote-payment-schedule ${styles.container}`}
        aria-labelledby="schedule-heading"
      >
        <header className={styles.header}>
          <div className={styles.titles}>
            <p className={`eyebrow ${styles.eyebrow}`}>When payment is due</p>
            <h2 id="schedule-heading" className={styles.heading}>
              Payment schedule
            </h2>
          </div>
        </header>
        {rows.length === 0 ? (
          <p className={`quiet-empty ${styles.empty}`}>
            No payment schedule. The full total is due on the quotation&apos;s
            terms.
          </p>
        ) : (
          <table className={styles.readOnlyTable}>
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Share</th>
                <th className={styles.numCol}>Amount</th>
                <th className={styles.numCol}>Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const amountText =
                  amounts && amounts[index] !== undefined
                    ? formatMinor(amounts[index]!, currencyCode, locale)
                    : "—";
                let dueText = "";
                if (row.trigger === "on_acceptance")
                  dueText = "Due on acceptance";
                else if (row.trigger === "on_delivery")
                  dueText = "Due on delivery";
                else if (row.trigger === "on_completion")
                  dueText = "Due on completion";
                else if (row.trigger === "on_date" && row.dueDate)
                  dueText = `Due on ${row.dueDate}`;

                return (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{formatBasisPoints(row.basisPoints)}</td>
                    <td className={styles.numCol}>{amountText}</td>
                    <td className={styles.numCol}>{dueText}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    );
  }

  // Editable presentation
  const isSaveDisabled =
    isScheduleSaving ||
    isDraftSaving ||
    isDraftDirty ||
    validationError !== null ||
    !isDirty;

  return (
    <section
      className={`quote-payment-schedule ${styles.container}`}
      aria-labelledby="schedule-heading"
    >
      <header className={styles.header}>
        <div className={styles.titles}>
          <p className={`eyebrow ${styles.eyebrow}`}>When payment is due</p>
          <h2 id="schedule-heading" className={styles.heading}>
            Payment schedule
          </h2>
        </div>
        {rows.length > 0 && rows.length < MAX_PAYMENT_MILESTONES && (
          <button
            type="button"
            className={styles.addButton}
            onClick={handleAddRow}
          >
            Add milestone
          </button>
        )}
      </header>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <p>
            No payment schedule. The full total is due on the quotation&apos;s
            terms.
          </p>
          <div className={styles.emptyActions}>
            <button
              type="button"
              className={styles.addButton}
              onClick={handleAddInitial}
            >
              Add payment schedule
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.rowsList}>
            {rows.map((row, index) => {
              const n = index + 1;
              const amountText =
                amounts && amounts[index] !== undefined
                  ? formatMinor(amounts[index]!, currencyCode, locale)
                  : "—";

              return (
                <div key={row.key} className={styles.rowItem}>
                  <div className={styles.rowGrid}>
                    <label className={styles.field}>
                      Milestone {n}
                      <input
                        type="text"
                        className={styles.control}
                        aria-label={`Milestone ${n} label`}
                        maxLength={120}
                        value={row.label}
                        onChange={(e) =>
                          handleLabelChange(index, e.target.value)
                        }
                      />
                    </label>

                    <label className={styles.field}>
                      Share (%)
                      <input
                        type="text"
                        inputMode="decimal"
                        className={`${styles.control} ${row.shareError ? styles.controlError : ""}`}
                        aria-label={`Milestone ${n} share`}
                        value={row.shareText}
                        onChange={(e) =>
                          handleShareChange(index, e.target.value)
                        }
                        onBlur={() => handleShareBlur(index)}
                      />
                    </label>

                    <label className={styles.field}>
                      Trigger
                      <select
                        className={styles.control}
                        aria-label={`Milestone ${n} trigger`}
                        value={row.trigger}
                        onChange={(e) =>
                          handleTriggerChange(
                            index,
                            e.target.value as PaymentTrigger,
                          )
                        }
                      >
                        <option value="on_acceptance">On acceptance</option>
                        <option value="on_delivery">On delivery</option>
                        <option value="on_completion">On completion</option>
                        <option value="on_date">On a date</option>
                      </select>
                    </label>

                    {row.trigger === "on_date" ? (
                      <label className={styles.field}>
                        Due date
                        <input
                          type="date"
                          min={issueDate}
                          className={styles.control}
                          aria-label={`Milestone ${n} due date`}
                          value={row.dueDate ?? ""}
                          onChange={(e) =>
                            handleDueDateChange(index, e.target.value)
                          }
                        />
                      </label>
                    ) : (
                      <div className={styles.field} aria-hidden="true" />
                    )}

                    <div className={styles.amountCol}>
                      <span>Amount</span>
                      <span className={styles.amountValue}>{amountText}</span>
                    </div>

                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Move milestone ${n} up`}
                        disabled={index === 0}
                        onClick={() => handleMoveUp(index)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`Move milestone ${n} down`}
                        disabled={index === rows.length - 1}
                        onClick={() => handleMoveDown(index)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`${styles.iconButton} ${styles.removeButton}`}
                        aria-label={`Remove milestone ${n}`}
                        onClick={() => handleRemoveRow(index)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {row.shareError && (
                    <p className={styles.rowInlineError}>{row.shareError}</p>
                  )}
                </div>
              );
            })}
          </div>

          <footer className={styles.footer}>
            <div className={styles.footerSummary}>
              <span className={styles.totalShares}>
                Total {formatBasisPoints(totalBps)} of 100.00%
              </span>
              {totalBps !== 10000 && (
                <span className={styles.amberNote}>
                  Shares must add up to 100.00% before submitting.
                </span>
              )}
              {rows.length >= MAX_PAYMENT_MILESTONES && (
                <span className={styles.maxNote}>
                  A schedule has at most 12 milestones.
                </span>
              )}
            </div>

            {validationError && (
              <div className={styles.validationBox}>{validationError}</div>
            )}

            <div className={styles.actionsBar}>
              <div className={styles.primaryActions}>
                <button
                  type="button"
                  className={styles.saveButton}
                  onClick={() => void handleSaveSchedule()}
                  disabled={isSaveDisabled}
                >
                  {isScheduleSaving ? "Saving…" : "Save schedule"}
                </button>
                {isDirty && !isScheduleSaving && (
                  <span className={styles.unsavedNotice}>
                    Unsaved schedule changes
                  </span>
                )}
                {saveMessage && !isDirty && (
                  <span className={styles.saveSuccess}>{saveMessage}</span>
                )}
                {saveError && (
                  <span className={styles.saveError}>{saveError}</span>
                )}
              </div>

              <button
                type="button"
                className={`${styles.removeScheduleButton} ${confirmRemove ? styles.removeScheduleConfirm : ""}`}
                onClick={() => void handleRemoveScheduleClick()}
                disabled={isScheduleSaving}
              >
                {confirmRemove ? "Click again to confirm" : "Remove schedule"}
              </button>
            </div>

            {staleMessage && (
              <div className={styles.conflictWrap}>
                <ConflictBanner
                  title="Schedule conflict"
                  body={staleMessage}
                  action={
                    <button
                      type="button"
                      className={styles.reloadButton}
                      onClick={() => router.refresh()}
                    >
                      Reload
                    </button>
                  }
                />
              </div>
            )}
          </footer>
        </>
      )}
    </section>
  );
}
