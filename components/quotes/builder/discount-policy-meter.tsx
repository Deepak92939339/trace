import styles from "./discount-policy-meter.module.css";

export type DiscountPolicyMeterProps = {
  discountBps: number;
  thresholdBps: number;
};

export function DiscountPolicyMeter({
  discountBps,
  thresholdBps,
}: DiscountPolicyMeterProps) {
  const isOverLimit = discountBps > thresholdBps;
  const discountPercentStr = `${(discountBps / 100).toFixed(2)}%`;
  const thresholdPercentStr = `${(thresholdBps / 100).toFixed(2)}%`;
  const label = `${discountPercentStr} of ${thresholdPercentStr} limit`;

  const maxBps = Math.max(thresholdBps * 2, discountBps, 1000);
  const fillWidthPercent =
    maxBps > 0 ? Math.min(100, Math.max(0, (discountBps / maxBps) * 100)) : 0;
  const tickLeftPercent =
    maxBps > 0 ? Math.min(100, Math.max(0, (thresholdBps / maxBps) * 100)) : 50;

  return (
    <div className={styles.meterContainer}>
      <div className={styles.header}>
        <span className={styles.title}>Discount policy</span>
        <span className={styles.ratio}>{label}</span>
      </div>

      <div className={styles.track} aria-hidden="true">
        <div
          className={`${styles.fill} ${
            isOverLimit ? styles.fillOver : styles.fillUnder
          }`}
          style={{ width: `${fillWidthPercent}%` }}
        />
        <div className={styles.tick} style={{ left: `${tickLeftPercent}%` }} />
      </div>

      <div className={styles.scale} aria-hidden="true">
        <span>0%</span>
        <span
          className={styles.scaleCenter}
          style={{ left: `${tickLeftPercent}%` }}
        >
          {thresholdPercentStr} limit
        </span>
        <span>{(maxBps / 100).toFixed(0)}%</span>
      </div>

      <div
        className={`${styles.policyNotice} ${
          isOverLimit ? styles.noticeAmber : styles.noticeAccent
        }`}
      >
        {isOverLimit ? (
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
        ) : (
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
            <path
              d="M5.5 8.2l1.8 1.8 3.5-3.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <span>
          {isOverLimit
            ? "Over the limit — a manager will need to approve"
            : "Within your limit — no approval needed"}
        </span>
      </div>
    </div>
  );
}
