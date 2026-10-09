import React from "react";
import { Button } from "@/components/ui/button";
import { ProductStage } from "./product-stage";
import styles from "./hero.module.css";

export function Hero() {
  return (
    <section className={styles.hero} id="product">
      <div className={styles.copy}>
        <span className={styles.kicker}>
          Commercial quotations, held to a clear rule.
        </span>
        <h1 className={styles.title}>
          Priced once. Approved on the record. Issued unchanged.
        </h1>
        <p className={styles.sub}>
          Currency, tax, approval and history stay attached to the same document
          from catalog to issue.
        </p>

        <div className={styles.cta}>
          <Button variant="primary" size="lg" href="#sample-builder">
            Try it — no account
          </Button>
          <Button variant="secondary" size="lg" href="/sign-in">
            Open reviewer demo
          </Button>
        </div>

        <div className={styles.trust}>
          <span className={styles.trustItem}>
            <svg
              className={styles.trustIcon}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path
                d="M3.5 8.5l3 3 6-6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Integer-exact money
          </span>
          <span className={styles.trustItem}>
            <svg
              className={styles.trustIcon}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path
                d="M3.5 8.5l3 3 6-6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Tenant-isolated data
          </span>
          <span className={styles.trustItem}>
            <svg
              className={styles.trustIcon}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path
                d="M3.5 8.5l3 3 6-6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Every change is a revision
          </span>
        </div>
      </div>

      <ProductStage />
    </section>
  );
}
