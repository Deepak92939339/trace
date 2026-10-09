import React from "react";
import Link from "next/link";
import styles from "./empty-state.module.css";

export type EmptyStateProps = {
  icon?: "check" | "search" | "inbox";
  title: string;
  hint?: React.ReactNode;
  action?: {
    label: string;
    href: string;
  };
  className?: string;
};

export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={`${styles.emptyState} ${className ?? ""}`.trim()}>
      {icon && (
        <div className={styles.icon}>
          {icon === "check" && (
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={styles.iconCheck}
            >
              <circle cx="12" cy="12" r="9" />
              <path d="m8.5 12.5 2.5 2.5 5-5" />
            </svg>
          )}
          {icon === "search" && (
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={styles.iconMuted}
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          )}
          {icon === "inbox" && (
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={styles.iconMuted}
            >
              <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
              <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
            </svg>
          )}
        </div>
      )}

      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
      {action && (
        <div className={styles.action}>
          <Link href={action.href} className={styles.actionLink}>
            {action.label}
          </Link>
        </div>
      )}
    </div>
  );
}
