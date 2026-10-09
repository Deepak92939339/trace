import React from "react";
import { formatBasisPoints } from "@/lib/formatting/basis-points";
import type { DraftMargin } from "@/app/(application)/quotes/[number]/draft-margin";
import styles from "./margin-meter.module.css";

export type MarginMeterProps = {
  margin: DraftMargin | null;
};

function clampBpsToPercent(bps: number): number {
  if (bps <= 0) return 0;
  if (bps >= 10000) return 100;
  return (bps - (bps % 100)) / 100;
}

export function MarginMeter({ margin }: MarginMeterProps) {
  if (!margin || margin.marginBps === null) {
    return (
      <div className={styles.meterContainer}>
        <div className={styles.header}>
          <span className={styles.title}>Margin</span>
        </div>
        <p className={styles.mutedNotice}>
          No line has a unit cost yet. Lines keep the cost from when they were
          added, so set costs in the catalog, then add or refresh the line.
        </p>
      </div>
    );
  }

  const tone = margin.belowCost ? "red" : margin.underFloor ? "amber" : "green";

  const marginPercent = clampBpsToPercent(margin.marginBps);
  const floorPercent =
    margin.floorBps !== null ? clampBpsToPercent(margin.floorBps) : null;
  const floorText =
    margin.floorBps !== null
      ? `Floor ${formatBasisPoints(margin.floorBps)}`
      : "No floor";
  const needsApproval = margin.belowCost || margin.underFloor;

  return (
    <div className={styles.meterContainer}>
      <div className={styles.header}>
        <span className={styles.title}>Margin</span>
        <div className={styles.values}>
          <span className={`${styles.marginValue} ${styles[`tone_${tone}`]}`}>
            {formatBasisPoints(margin.marginBps)}
          </span>
          <span className={styles.floorText}>{floorText}</span>
        </div>
      </div>

      <div
        className={styles.track}
        style={
          {
            "--margin-pct": `${marginPercent}%`,
            ...(floorPercent !== null
              ? { "--floor-pct": `${floorPercent}%` }
              : {}),
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        <div className={`${styles.fill} ${styles[`fill_${tone}`]}`} />
        {floorPercent !== null && <div className={styles.tick} />}
      </div>

      {margin.linesWithoutCost > 0 && (
        <p className={styles.linesNote}>
          {margin.linesWithoutCost} line
          {margin.linesWithoutCost === 1 ? "" : "s"} without cost — excluded
        </p>
      )}

      {needsApproval && (
        <div
          className={`${styles.notice} ${
            tone === "red" ? styles.noticeRed : styles.noticeAmber
          }`}
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="6.5" />
            <path d="M8 5v3.5M8 11h.01" strokeLinecap="round" />
          </svg>
          <span>This quote will need manager approval.</span>
        </div>
      )}
    </div>
  );
}
