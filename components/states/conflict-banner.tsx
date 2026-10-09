import React from "react";
import styles from "./conflict-banner.module.css";

export type ConflictBannerProps = {
  title: React.ReactNode;
  body: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function ConflictBanner({
  title,
  body,
  action,
  className,
}: ConflictBannerProps) {
  return (
    <div
      className={`${styles.banner} ${className ?? ""}`.trim()}
    >
      <div className={styles.iconWrap}>
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={styles.icon}
        >
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div className={styles.content}>
        <div className={styles.title}>{title}</div>
        <div className={styles.body}>{body}</div>
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
