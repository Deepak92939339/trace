import styles from "./stamp.module.css";

export type StampVariant =
  "draft" | "approved" | "issued" | "accepted" | "paid" | "rejected";

const LABELS: Record<StampVariant, string> = {
  draft: "Draft",
  approved: "Approved",
  issued: "Issued",
  accepted: "Accepted",
  paid: "Paid",
  rejected: "Rejected",
};

export type StampProps = {
  variant: StampVariant;
  /** e.g. "Rev 3" — printed before the state. */
  prefix?: string;
  /** Short fingerprint, already shortened by shortFingerprint(). */
  fingerprint?: string;
  /** Degrees. Default −4. */
  rotate?: number;
  className?: string;
};

/** Rubber-stamp mark: the record carries its own history. Decorative; text equivalent is visually hidden. */
export function Stamp({
  variant,
  prefix,
  fingerprint,
  rotate = -4,
  className,
}: StampProps) {
  const label = LABELS[variant];
  const heading = prefix ? `${prefix} · ${label}` : label;
  const spoken = [
    prefix,
    label,
    fingerprint ? `fingerprint ${fingerprint}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <span className={[styles.wrap, className ?? ""].filter(Boolean).join(" ")}>
      <span
        aria-hidden="true"
        className={[styles.stamp, styles[variant]].join(" ")}
        style={{ transform: `rotate(${rotate}deg)` }}
      >
        <span className={styles.label}>{heading}</span>
        {fingerprint ? <span className={styles.fp}>{fingerprint}</span> : null}
      </span>
      <span className={styles.srOnly}>{spoken}</span>
    </span>
  );
}

/** First 6 + "…" + last 4 hex characters. Display only. */
export function shortFingerprint(
  hash: string | null | undefined,
): string | undefined {
  if (!hash) return undefined;
  const clean = hash.trim().toLowerCase();
  return clean.length <= 12 ? clean : `${clean.slice(0, 6)}…${clean.slice(-4)}`;
}
