import React from "react";
import styles from "./skeleton.module.css";

export type SkeletonProps = {
  variant: "page" | "table" | "document";
  rows?: number;
  className?: string;
};

export function Skeleton({ variant, rows, className }: SkeletonProps) {
  const rowCount =
    rows ?? (variant === "table" ? 5 : variant === "document" ? 3 : 4);
  const rowIndices = Array.from({ length: rowCount }, (_, i) => i);

  return (
    <div
      className={`${styles.skeleton} ${styles[variant]} ${className ?? ""}`.trim()}
    >
      <span className={styles.srOnly}>Loading…</span>

      {variant === "page" && (
        <div className={styles.pageWrap} aria-hidden="true">
          <div className={styles.pageHeader}>
            <div className={`${styles.block} ${styles.eyebrowBlock}`} />
            <div className={`${styles.block} ${styles.titleBlock}`} />
            <div className={`${styles.block} ${styles.subBlock}`} />
          </div>
          <div className={styles.pageBody}>
            {rowIndices.map((i) => (
              <div key={i} className={`${styles.block} ${styles.cardBlock}`} />
            ))}
          </div>
        </div>
      )}

      {variant === "table" && (
        <div className={styles.tableWrap} aria-hidden="true">
          <div className={`${styles.block} ${styles.tableHeaderBlock}`} />
          {rowIndices.map((i) => (
            <div key={i} className={styles.tableRow}>
              <div
                className={`${styles.block} ${styles.tableCell} ${styles.cellWide}`}
              />
              <div className={`${styles.block} ${styles.tableCell}`} />
              <div className={`${styles.block} ${styles.tableCell}`} />
              <div
                className={`${styles.block} ${styles.tableCell} ${styles.cellNarrow}`}
              />
            </div>
          ))}
        </div>
      )}

      {variant === "document" && (
        <div className={styles.docWrap} aria-hidden="true">
          <div className={styles.docHeader}>
            <div className={`${styles.block} ${styles.docBrandBlock}`} />
            <div className={`${styles.block} ${styles.docMetaBlock}`} />
          </div>
          <div className={`${styles.block} ${styles.docRule}`} />
          <div className={styles.docRows}>
            {rowIndices.map((i) => (
              <div key={i} className={styles.docRow}>
                <div className={`${styles.block} ${styles.docItemBlock}`} />
                <div className={`${styles.block} ${styles.docPriceBlock}`} />
              </div>
            ))}
          </div>
          <div className={styles.docFooter}>
            <div className={`${styles.block} ${styles.docTotalBlock}`} />
          </div>
        </div>
      )}
    </div>
  );
}
