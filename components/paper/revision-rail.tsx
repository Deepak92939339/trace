import Link from "next/link";
import type { QuoteRevisionProjection } from "@/lib/quotes/commitment-contracts";
import { StatusPill } from "@/components/ui/status-pill";
import { shortFingerprint } from "./stamp";
import styles from "./revision-rail.module.css";

export type RevisionRailProps = {
  revisions: QuoteRevisionProjection[];
  currentRevisionId: string | null;
  acceptedRevisionId?: string | null;
  /** Build a link for a revision; omit to render static nodes. */
  hrefFor?: (revision: QuoteRevisionProjection) => string;
  locale?: string;
  timeZone?: string;
  label?: string;
  className?: string;
};

function revisionDate(revision: QuoteRevisionProjection): string | null {
  return (
    revision.issuedAt ??
    revision.approvedAt ??
    revision.rejectedAt ??
    revision.submittedAt ??
    revision.legacyCapturedAt
  );
}

/** Thin rail through every revision with its fingerprint — Trace's record of what changed and when. */
export function RevisionRail({
  revisions,
  currentRevisionId,
  acceptedRevisionId = null,
  hrefFor,
  locale = "en-GB",
  timeZone = "UTC",
  label = "Revisions",
  className,
}: RevisionRailProps) {
  const ordered = [...revisions].sort(
    (a, b) => b.revisionNumber - a.revisionNumber,
  );
  const dateFormat = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });

  return (
    <nav
      aria-label={label}
      className={[styles.rail, className ?? ""].filter(Boolean).join(" ")}
    >
      <h3 className={styles.heading}>{label}</h3>
      <ol className={styles.list}>
        {ordered.map((revision) => {
          const isCurrent = revision.id === currentRevisionId;
          const isAccepted = revision.id === acceptedRevisionId;
          const iso = revisionDate(revision);
          const fingerprint = shortFingerprint(revision.snapshotHash);
          const body = (
            <>
              <span className={styles.top}>
                <span className={styles.rev}>
                  Rev {revision.revisionNumber}
                </span>
                <StatusPill state={revision.effectiveState} />
              </span>
              <span className={styles.meta}>
                {fingerprint ? (
                  <span className={styles.fp}>{fingerprint}</span>
                ) : null}
                {iso ? (
                  <time dateTime={iso}>{dateFormat.format(new Date(iso))}</time>
                ) : null}
                {revision.recordKind === "legacy_capture" ? (
                  <span className={styles.legacy}>Unverified capture</span>
                ) : null}
              </span>
            </>
          );
          const nodeClass = [
            styles.node,
            isCurrent ? styles.current : "",
            isAccepted ? styles.accepted : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li
              key={revision.id}
              className={nodeClass}
              aria-current={isCurrent ? "true" : undefined}
            >
              <span className={styles.dot} aria-hidden="true" />
              {hrefFor ? (
                <Link className={styles.body} href={hrefFor(revision)}>
                  {body}
                </Link>
              ) : (
                <span className={styles.body}>{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
