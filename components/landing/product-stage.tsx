"use client";

import React from "react";
import { Paper } from "@/components/paper/paper";
import { DoubleRule } from "@/components/paper/double-rule";
import { Stamp } from "@/components/paper/stamp";
import { Money } from "@/components/ui/money";
import styles from "./product-stage.module.css";

export function ProductStage() {
  return (
    <div className={styles.stage} aria-label="Product preview">
      {/* Workbench card behind */}
      <div className={styles.bench} aria-hidden="true">
        <div className={styles.benchTop}>
          <i className={styles.dot} />
          <i className={styles.dot} />
          <i className={styles.dot} />
          <span className={styles.mono}>Quotes / TRC-2026-0142 · Rev 3</span>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Description</th>
              <th className={styles.r}>Qty</th>
              <th className={styles.r}>Unit price</th>
              <th className={styles.r}>Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Steel mounting frame, custom</td>
              <td className={`${styles.r} ${styles.num}`}>4</td>
              <td className={styles.r}>
                <Money
                  minor={125000}
                  currency="USD"
                  locale="en-US"
                  showCurrency={false}
                />
              </td>
              <td className={styles.r}>
                <Money
                  minor={500000}
                  currency="USD"
                  locale="en-US"
                  showCurrency={false}
                />
              </td>
            </tr>
            <tr className={styles.rowFocus}>
              <td>Stainless feed rail</td>
              <td className={`${styles.r} ${styles.num}`}>12</td>
              <td className={styles.r}>
                <Money
                  minor={8500}
                  currency="USD"
                  locale="en-US"
                  showCurrency={false}
                />
              </td>
              <td className={styles.r}>
                <Money
                  minor={102000}
                  currency="USD"
                  locale="en-US"
                  showCurrency={false}
                />
              </td>
            </tr>
            <tr>
              <td>Precision coupling assembly</td>
              <td className={`${styles.r} ${styles.num}`}>6</td>
              <td className={styles.r}>
                <Money
                  minor={34000}
                  currency="USD"
                  locale="en-US"
                  showCurrency={false}
                />
              </td>
              <td className={styles.r}>
                <Money
                  minor={204000}
                  currency="USD"
                  locale="en-US"
                  showCurrency={false}
                />
              </td>
            </tr>
            <tr>
              <td>Powder coating, RAL 7016</td>
              <td className={`${styles.r} ${styles.num}`}>1</td>
              <td className={styles.r}>
                <Money
                  minor={68000}
                  currency="USD"
                  locale="en-US"
                  showCurrency={false}
                />
              </td>
              <td className={styles.r}>
                <Money
                  minor={68000}
                  currency="USD"
                  locale="en-US"
                  showCurrency={false}
                />
              </td>
            </tr>
            <tr>
              <td className={styles.discountLabel}>Discount 12.00%</td>
              <td />
              <td />
              <td className={styles.r}>
                <Money
                  minor={-104880}
                  currency="USD"
                  locale="en-US"
                  showCurrency={false}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <div className={styles.approvalNotice}>
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M8 2.5l6 11H2z" strokeLinejoin="round" />
            <path d="M8 7v3M8 12h.01" strokeLinecap="round" />
          </svg>
          <span>
            12.00% exceeds the 10.00% limit — routed to Meera Kapoor for approval
          </span>
        </div>
      </div>

      {/* Paper proposal in front */}
      <Paper
        as="article"
        className={styles.record}
        aria-hidden="true"
      >
        <div className={styles.stampSpot}>
          <Stamp
            variant="accepted"
            prefix="Rev 3"
            fingerprint="7f3a91…c21e"
            rotate={-4}
          />
        </div>
        <div className={styles.docHead}>
          <span className={styles.sellerName}>Northline Fabrication Ltd</span>
          <span className={styles.docMeta}>
            Proposal
            <span className={styles.mono}>TRC-2026-0142</span>
          </span>
        </div>
        <DoubleRule className={styles.rule} />
        <h3 className={styles.docTitle}>Custom mounting system for Line 4</h3>
        <div className={styles.totalsRows}>
          <div className={styles.totalRow}>
            <span>Subtotal</span>
            <Money
              minor={874000}
              currency="USD"
              locale="en-US"
              showCurrency={false}
            />
          </div>
          <div className={styles.totalRow}>
            <span>Discount 12.00%</span>
            <Money
              minor={-104880}
              currency="USD"
              locale="en-US"
              showCurrency={false}
            />
          </div>
          <div className={styles.totalRow}>
            <span>Sales tax 8.25%</span>
            <Money
              minor={63452}
              currency="USD"
              locale="en-US"
              showCurrency={false}
            />
          </div>
        </div>
        <div className={styles.grandTotal}>
          <span>Total</span>
          <Money minor={832572} currency="USD" locale="en-US" size="md" />
        </div>
        <p className={styles.acceptedNote}>
          Accepted by Priya Raman · 3 Oct 2026, 14:02
        </p>
      </Paper>
    </div>
  );
}
