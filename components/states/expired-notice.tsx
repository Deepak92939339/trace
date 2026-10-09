import React from "react";
import styles from "./expired-notice.module.css";

export type ExpiredNoticeProps = {
  title: string;
  body: React.ReactNode;
  tone: "expired" | "closed";
  className?: string;
};

export function ExpiredNotice({
  title,
  body,
  tone,
  className,
}: ExpiredNoticeProps) {
  return (
    <div
      className={`${styles.notice} ${styles[tone]} ${className ?? ""}`.trim()}
    >
      <div className={styles.iconWrap}>
        {tone === "closed" ? (
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={styles.lockIcon}
          >
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={styles.clockIcon}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        )}
      </div>
      <div className={styles.content}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>
      </div>
    </div>
  );
}
