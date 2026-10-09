import React from "react";
import styles from "./proof-cards.module.css";

export type ProofCardItem = {
  figure: string;
  title: string;
  description: string;
};

const DEFAULT_PROOFS: ProofCardItem[] = [
  {
    figure: "5,000 / 5,000",
    title: "Two calculators, one answer",
    description:
      "The screen and the database compute every quote independently. Five thousand test cases agree to the cent.",
  },
  {
    figure: "652",
    title: "Database rules under test",
    description:
      "Tenant isolation, approval limits and revision locks are enforced in the database and checked by automated tests.",
  },
  {
    figure: "1 winner",
    title: "No double decisions",
    description:
      "Two managers clicking approve at once produce exactly one recorded decision. Double-clicks never double-accept.",
  },
];

export function ProofCards({
  cards = DEFAULT_PROOFS,
}: {
  cards?: ProofCardItem[];
}) {
  return (
    <section className={styles.proofs} aria-label="Proof points">
      {cards.map((card, index) => (
        <div key={index} className={styles.card}>
          <div className={styles.figure}>{card.figure}</div>
          <h3 className={styles.title}>{card.title}</h3>
          <p className={styles.desc}>{card.description}</p>
        </div>
      ))}
    </section>
  );
}
