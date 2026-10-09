"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Paper } from "@/components/paper/paper";
import { shortFingerprint } from "@/components/paper/stamp";
import type { AcceptanceProjection } from "@/lib/quotes/commitment-contracts";
import type { RecipientQuoteViewModel } from "@/lib/public-quotes/view-model";
import styles from "./acceptance-receipt.module.css";

export type AcceptanceReceiptProps = {
  acceptance: AcceptanceProjection;
  quote: RecipientQuoteViewModel;
};

export function AcceptanceReceipt({
  acceptance,
  quote,
}: AcceptanceReceiptProps) {
  const headingId = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  async function handleCopyFingerprint() {
    try {
      await navigator.clipboard.writeText(acceptance.snapshotHash);
      setCopyState("copied");
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopyState("idle");
      }, 2000);
    } catch {
      setCopyState("failed");
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setCopyState("idle");
      }, 2000);
    }
  }

  const copyButtonLabel =
    copyState === "copied"
      ? "Copied"
      : copyState === "failed"
        ? "Copy failed"
        : "Copy";

  return (
    <section
      className={`recipient-acceptance-evidence ${styles.receipt}`}
      aria-labelledby={headingId}
    >
      <Paper padding="lg" as="article" className={styles.card}>
        <svg className={styles.ok} viewBox="0 0 44 44" aria-hidden="true">
          <circle cx="22" cy="22" r="20.5" />
          <path d="M13.5 22.5l6 6 11-12" />
        </svg>

        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className={styles.title}
        >
          Acceptance recorded
        </h2>

        <p className={styles.lede}>
          Your acceptance is recorded against revision {quote.revisionNumber} of{" "}
          {quote.quoteNumber}.
        </p>

        {acceptance.replayed && (
          <p className={styles.replayed}>
            This acceptance was already recorded. Showing the original record.
          </p>
        )}

        <dl className={styles.kv}>
          <dt>Quotation</dt>
          <dd>
            <span className={styles.mono}>{quote.quoteNumber}</span>
          </dd>

          <dt>Revision accepted</dt>
          <dd>Revision {quote.revisionNumber}</dd>

          <dt>Total</dt>
          <dd className={styles.num}>{quote.totals.total}</dd>

          <dt>Accepted by</dt>
          <dd>
            <div>
              {acceptance.buyerAssertedName}
              {acceptance.buyerAssertedTitle
                ? `, ${acceptance.buyerAssertedTitle}`
                : ""}
            </div>
            <small className={styles.mutedText}>
              Name and title as entered by the buyer. Not a verified identity.
            </small>
          </dd>

          <dt>Recorded for</dt>
          <dd>{acceptance.recipientEmailSnapshot}</dd>

          <dt>Accepted at</dt>
          <dd className={styles.num}>
            {new Intl.DateTimeFormat(quote.locale, {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
              timeZoneName: "short",
            }).format(new Date(acceptance.acceptedAt))}
          </dd>

          <dt>Document fingerprint</dt>
          <dd>
            <span className={styles.mono}>
              {shortFingerprint(acceptance.snapshotHash)}
            </span>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={handleCopyFingerprint}
            >
              <svg
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <rect x="5" y="5" width="8" height="8" rx="1.5" />
                <path d="M11 5V4a1 1 0 00-1-1H4a1 1 0 00-1 1v6a1 1 0 001 1h1" />
              </svg>
              {copyButtonLabel}
            </button>
            <span className="sr-only" aria-live="polite">
              {copyState === "copied"
                ? "Document fingerprint copied"
                : copyState === "failed"
                  ? "Copy failed"
                  : ""}
            </span>
          </dd>

          <dt>Statement evidence</dt>
          <dd>
            <span className={styles.mono}>
              {acceptance.acceptanceStatementHash.slice(0, 16)}
            </span>
          </dd>
        </dl>

        <section className={styles.statementSection}>
          <h3>Statement you accepted</h3>
          <blockquote className={styles.statement}>
            {acceptance.acceptanceStatement}
          </blockquote>
        </section>

        <div className={styles.actions}>
          <a className={styles.viewLink} href="#quotation-document">
            View the accepted quotation
          </a>
        </div>

        <p className={styles.finePrint}>
          This record cannot be edited. Any change to the quotation creates a new
          revision, which would need its own acceptance.
        </p>
      </Paper>
    </section>
  );
}
