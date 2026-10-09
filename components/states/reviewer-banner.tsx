import React from "react";
import styles from "./reviewer-banner.module.css";

export function ReviewerBanner({ className }: { className?: string }) {
  return (
    <div
      className={`${styles.banner} ${className ?? ""}`.trim()}
    >
      <svg
        viewBox="0 0 24 24"
        width="15"
        height="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={styles.eyeIcon}
      >
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      <span>
        Read-only workspace. You can open everything; nothing you do here changes data.
      </span>
    </div>
  );
}

export function ReadOnlyNotice({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${styles.readOnlyNotice} ${className ?? ""}`.trim()}
      role="note"
    >
      {children}
    </div>
  );
}
