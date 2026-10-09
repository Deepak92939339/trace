import styles from "./submission-snapshot.module.css";

export type CustomerSnapshot = {
  name: string;
  contactName: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
  taxIdentifier: string | null;
  approvalThresholdBps: number;
};

type SubmissionSnapshotProps = {
  customerSnapshot?: CustomerSnapshot | null;
  className?: string;
};

export function SubmissionSnapshot({
  customerSnapshot,
  className,
}: SubmissionSnapshotProps) {
  if (!customerSnapshot) return null;

  return (
    <section
      className={`quote-submission-snapshot ${styles.container} ${className ?? ""}`}
      aria-labelledby="submission-snapshot-heading"
    >
      <div>
        <p className={`eyebrow ${styles.eyebrow}`}>Submission snapshot</p>
        <h2 id="submission-snapshot-heading" className={styles.name}>
          {customerSnapshot.name}
        </h2>
        <p className={styles.contact}>
          {[customerSnapshot.contactName, customerSnapshot.email]
            .filter(Boolean)
            .join(" · ") || "No contact details supplied"}
        </p>
      </div>
      <dl className={styles.details}>
        <div className={styles.row}>
          <dt className={styles.dt}>Billing address</dt>
          <dd className={styles.dd}>
            {[
              customerSnapshot.addressLine1,
              customerSnapshot.addressLine2,
              customerSnapshot.city,
              customerSnapshot.region,
              customerSnapshot.postalCode,
              customerSnapshot.countryCode,
            ]
              .filter(Boolean)
              .join(", ") || "—"}
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.dt}>Tax identifier</dt>
          <dd className={styles.dd}>{customerSnapshot.taxIdentifier || "—"}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.dt}>Approval threshold at submission</dt>
          <dd className={styles.dd}>
            {(customerSnapshot.approvalThresholdBps / 100).toFixed(2)}%
          </dd>
        </div>
      </dl>
    </section>
  );
}
