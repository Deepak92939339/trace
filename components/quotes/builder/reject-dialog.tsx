import type { RefObject } from "react";
import styles from "./reject-dialog.module.css";

type RejectDialogProps = {
  rejectDialogRef: RefObject<HTMLDialogElement | null>;
  rejectReasonRef: RefObject<HTMLTextAreaElement | null>;
  workflowBusy: boolean;
  workflowMessage: string;
  onClose: () => void;
  onConfirmReject: (reason: string) => void;
};

export function RejectDialog({
  rejectDialogRef,
  rejectReasonRef,
  workflowBusy,
  workflowMessage,
  onClose,
  onConfirmReject,
}: RejectDialogProps) {
  return (
    <dialog
      className={`reject-dialog ${styles.dialog}`}
      ref={rejectDialogRef}
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "textarea, button:not([disabled])",
          ),
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first && last) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last &&
          first
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      aria-labelledby="reject-heading"
    >
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          const reason = rejectReasonRef.current?.value ?? "";
          if (reason.trim().length >= 3) onConfirmReject(reason);
        }}
      >
        <p className={`eyebrow ${styles.eyebrow}`}>Commercial decision</p>
        <h2 id="reject-heading" className={styles.heading}>
          Reject quotation
        </h2>
        <p className={styles.description}>
          Give a meaningful reason. It becomes untrusted text in the commercial
          Activity record.
        </p>
        <label className={styles.field}>
          Rejection reason
          <textarea
            ref={rejectReasonRef}
            className={styles.textarea}
            required
            minLength={3}
            maxLength={1000}
            rows={6}
          />
        </label>
        {workflowMessage && (
          <p
            className={`workflow-message ${styles.workflowMessage}`}
            role="status"
            aria-live="polite"
          >
            {workflowMessage}
          </p>
        )}
        <div className={`dialog-actions ${styles.actions}`}>
          <button
            className={`button ${styles.cancelButton}`}
            type="button"
            onClick={() => rejectDialogRef.current?.close()}
          >
            Cancel
          </button>
          <button
            className={`button button-primary ${styles.confirmButton}`}
            type="submit"
            disabled={workflowBusy}
          >
            Confirm rejection
          </button>
        </div>
      </form>
    </dialog>
  );
}
