import React from "react";
import { StatusPill } from "@/components/ui/status-pill";
import styles from "./lifecycle-row.module.css";

export function LifecycleRow() {
  const steps = [
    {
      num: "01",
      title: "Draft",
      desc: "Price from your catalog. Totals update as you type.",
      pillState: "draft" as const,
    },
    {
      num: "02",
      title: "Approve",
      desc: "Discounts over your limit go to a manager, with the reason.",
      pillState: "waiting" as const,
    },
    {
      num: "03",
      title: "Issue",
      desc: "Numbers freeze. Changes create a new revision.",
      pillState: "issued" as const,
    },
    {
      num: "04",
      title: "Accept",
      desc: "The customer accepts the exact revision on a private link.",
      pillState: "accepted" as const,
    },
  ];

  return (
    <section className={styles.life} aria-labelledby="life-heading">
      <h2 id="life-heading" className={styles.title}>
        One document, from price to acceptance
      </h2>
      <p className={styles.sub}>
        Every step leaves a record you can show an auditor — or a customer who
        &ldquo;never agreed to that&rdquo;.
      </p>
      <div className={styles.flow}>
        {steps.map((step) => (
          <div key={step.num} className={styles.step}>
            <span className={styles.stepNumber}>{step.num}</span>
            <b className={styles.stepTitle}>{step.title}</b>
            <p className={styles.stepDesc}>{step.desc}</p>
            <div className={styles.pillWrap}>
              <StatusPill state={step.pillState} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
