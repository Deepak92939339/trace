import React from "react";
import styles from "./error-state.module.css";

export type ErrorStateProps = {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  body: React.ReactNode;
  actions?: React.ReactNode;
  reference?: string;
  className?: string;
};

export function ErrorState({
  eyebrow,
  title,
  body,
  actions,
  reference,
  className,
}: ErrorStateProps) {
  return (
    <div className={`${styles.errorState} ${className ?? ""}`.trim()}>
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.body}>{body}</p>
      {actions && <div className={styles.actions}>{actions}</div>}
      {reference && (
        <p className={styles.reference}>
          Reference: <code className={styles.mono}>{reference}</code>
        </p>
      )}
    </div>
  );
}
