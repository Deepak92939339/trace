import styles from "./builder-header.module.css";

type BuilderHeaderProps = {
  quote: {
    number: string;
  };
  stateLabel: string;
  className?: string;
};

export function BuilderHeader({
  quote,
  stateLabel,
  className,
}: BuilderHeaderProps) {
  const norm = stateLabel.toLowerCase().trim();
  let stateVariant = styles.stateDraft;
  if (norm === "waiting") stateVariant = styles.stateWaiting;
  else if (norm === "approved") stateVariant = styles.stateApproved;
  else if (norm === "issued") stateVariant = styles.stateIssued;
  else if (norm === "rejected") stateVariant = styles.stateRejected;
  else if (norm === "expired") stateVariant = styles.stateExpired;

  return (
    <header
      className={`quote-document-header ${styles.header} ${className ?? ""}`}
    >
      <div className={styles.titles}>
        <p className={`eyebrow ${styles.eyebrow}`}>Quotation</p>
        <h1 id="quote-number-heading" className={styles.heading}>
          {quote.number}
        </h1>
      </div>
      <span className={`state-label ${styles.stateLabel} ${stateVariant}`}>
        {stateLabel}
      </span>
    </header>
  );
}
