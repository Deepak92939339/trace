import type { RefObject } from "react";
import type { QuoteState } from "@/lib/quotes/effective-state";
import { Kbd } from "@/components/ui/kbd";
import { PdfDownload, type PdfDownloadProps } from "./pdf-download";
import styles from "./decision-actions.module.css";

type DecisionActionsProps = {
  quote: { state: QuoteState };
  capabilities: string[];
  editable: boolean;
  saveState: string;
  workflowBusy: boolean;
  lines: { length: number };
  workflowMessage: string;
  rejectButtonRef: RefObject<HTMLButtonElement | null>;
  onSaveDraft: () => void;
  onSubmitForDecision: () => void;
  onApproveQuote: () => void;
  onOpenRejectDialog: () => void;
  onIssueQuote: () => void;
  onPrintQuote: () => void;
  /** Present for an issued quote whose current revision is sealed (so it can have a PDF). */
  pdfDownload?: Omit<PdfDownloadProps, "buttonClassName"> | null;
};

export function DecisionActions({
  quote,
  capabilities,
  editable,
  saveState,
  workflowBusy,
  lines,
  workflowMessage,
  rejectButtonRef,
  onSaveDraft,
  onSubmitForDecision,
  onApproveQuote,
  onOpenRejectDialog,
  onIssueQuote,
  onPrintQuote,
  pdfDownload,
}: DecisionActionsProps) {
  return (
    <>
      <div className={`summary-actions ${styles.container}`}>
        {editable && (
          <button
            className={`button ${styles.secondaryButton}`}
            type="button"
            onClick={onSaveDraft}
            disabled={saveState === "Saving…"}
          >
            Save draft <Kbd className={styles.kbd}>⌘S</Kbd>
          </button>
        )}
        {quote.state === "draft" && capabilities.includes("quote.submit") && (
          <button
            className={`button button-primary ${styles.primaryButton}`}
            type="button"
            onClick={onSubmitForDecision}
            disabled={
              workflowBusy || saveState !== "Saved" || lines.length === 0
            }
          >
            Submit for decision <Kbd className={styles.kbd}>⌘↵</Kbd>
          </button>
        )}
        {quote.state === "waiting" &&
          capabilities.includes("quote.approve") && (
            <button
              className={`button button-primary ${styles.primaryButton}`}
              type="button"
              onClick={onApproveQuote}
              disabled={workflowBusy}
            >
              Approve quote
            </button>
          )}
        {quote.state === "waiting" && capabilities.includes("quote.reject") && (
          <button
            ref={rejectButtonRef}
            className={`button ${styles.secondaryButton}`}
            type="button"
            onClick={onOpenRejectDialog}
            disabled={workflowBusy}
          >
            Reject quote
          </button>
        )}
        {quote.state === "approved" && capabilities.includes("quote.issue") && (
          <button
            className={`button button-primary ${styles.primaryButton}`}
            type="button"
            onClick={onIssueQuote}
            disabled={workflowBusy}
          >
            Issue quote
          </button>
        )}
        {quote.state === "issued" && capabilities.includes("quote.print") && (
          <button
            className={`button button-primary ${styles.primaryButton}`}
            type="button"
            onClick={onPrintQuote}
          >
            Print / Save PDF
          </button>
        )}
        {quote.state === "issued" && pdfDownload && (
          <PdfDownload
            {...pdfDownload}
            buttonClassName={styles.secondaryButton}
          />
        )}
      </div>
      {workflowMessage && (
        <p
          className={`workflow-message ${styles.workflowMessage}`}
          role="status"
          aria-live="polite"
        >
          {workflowMessage}
        </p>
      )}
    </>
  );
}
