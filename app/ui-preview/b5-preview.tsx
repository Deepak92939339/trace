"use client";

import React, { useState } from "react";
import { ProposalView } from "@/components/proposal/proposal-view";
import { Paper } from "@/components/paper/paper";
import { Brand } from "@/components/ui/brand";
import type { RecipientQuoteViewModel } from "@/lib/public-quotes/view-model";
import recipientStyles from "@/components/public-quotes/recipient.module.css";
import styles from "./b3-preview.module.css";

const FIXTURE_QUOTE: RecipientQuoteViewModel = {
  quoteNumber: "TRC-2026-0142",
  revisionNumber: 3,
  effectiveState: "issued",
  responseType: null,
  issueDate: "1 Oct 2026",
  validUntil: "14 Nov 2026",
  locale: "en-US",
  currency: "USD",
  taxLabel: "Sales tax 8.25%",
  seller: {
    legal_name: "Northline Fabrication Ltd",
    address_line1: "Unit 7, Riverside Works",
    address_line2: "Sheffield S3 8DT",
    city: "",
    region: "",
    postal_code: "",
    country_code: "United Kingdom",
  },
  buyer: {
    name: "Asha Engineering Works",
    contact_name: "Priya Raman",
    email: "priya@asha.example",
    address_line1: "",
    address_line2: "",
    city: "",
    region: "",
    postal_code: "",
    country_code: "",
  },
  items: [
    {
      id: "i1",
      sku: "SKU-4401",
      description:
        "Steel mounting frame, custom (S355 steel, 1,200 × 800 mm, welded and drilled to drawing NF-4402)",
      quantity_scaled: 4000,
      quantity_scale: 1000,
      unit_code: "EA",
      tax_code: "Standard",
      unitPriceDisplay: "1,250.00",
      lineAmountDisplay: "5,000.00",
    },
    {
      id: "i2",
      sku: "SKU-4402",
      description: "Stainless feed rail (316L, polished, cut to length on site)",
      quantity_scaled: 12000,
      quantity_scale: 1000,
      unit_code: "M",
      tax_code: "Standard",
      unitPriceDisplay: "85.00",
      lineAmountDisplay: "1,020.00",
    },
    {
      id: "i3",
      sku: "SKU-4403",
      description:
        "Precision coupling assembly (Tolerance ±0.02 mm, supplied with fixings)",
      quantity_scaled: 6000,
      quantity_scale: 1000,
      unit_code: "EA",
      tax_code: "Standard",
      unitPriceDisplay: "340.00",
      lineAmountDisplay: "2,040.00",
    },
    {
      id: "i4",
      sku: "SKU-4404",
      description: "Powder coating, RAL 7016 (Frames only, 80 µm minimum)",
      quantity_scaled: 1000,
      quantity_scale: 1000,
      unit_code: "EA",
      tax_code: "Standard",
      unitPriceDisplay: "680.00",
      lineAmountDisplay: "680.00",
    },
  ],
  charges: [],
  totals: {
    subtotal: "8,740.00",
    discount: "1,048.80",
    tax: "634.52",
    charges: "0.00",
    total: "8,325.72",
  },
  notes:
    "Priya — this revision applies the 12% you asked for on Rev 2. Frames ship in two batches, and coating is RAL 7016 as agreed on site.\n\nMeera Kapoor, Sales manager",
  snapshotHash: "7f3a91b2c4d5e6f7a8b9c0d1e2f3a4b5",
  calculationFingerprint: "c21e3f4a5b6c7d8e9f0a1b2c3d4e5f6a",
  acceptanceStatementVersion: 1,
  acceptanceStatement:
    "Both parties keep a record of this acceptance: your name and title, the time, and the document fingerprint.",
} as unknown as RecipientQuoteViewModel;

export function B5Preview() {
  const [canRespond] = useState(true);
  const [quote] = useState<RecipientQuoteViewModel>(FIXTURE_QUOTE);

  return (
    <section className={styles.section} aria-labelledby="b5-title">
      <h2 id="b5-title" className={styles.title}>
        <span>Proposal (B5)</span>
        <span className={styles.hint}>
          ProposalView Document & Actions Bar
        </span>
      </h2>

      <div className={recipientStyles.shell}>
        <header className={`recipient-header ${recipientStyles.header}`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Secure quotation view</span>
        </header>

        <ProposalView
          quote={quote}
          canRespond={canRespond}
          onRequestChanges={() => alert("onRequestChanges")}
          onDecline={() => alert("onDecline")}
          onAccept={() => alert("onAccept")}
        />

        <div className={recipientStyles.lowerWrap}>
          <div className={`recipient-verification ${recipientStyles.verification}`}>
            <Paper padding="md" as="section">
              <h2 className={recipientStyles.verificationTitle}>Verify a quotation</h2>
              <p>Enter the 32-character code from the document footer.</p>
              <form onSubmit={(e) => e.preventDefault()}>
                <label className={recipientStyles.label}>
                  Verification code
                  <input
                    className={recipientStyles.input}
                    defaultValue=""
                    placeholder="Enter 32-hex verification code"
                  />
                </label>
                <button className={recipientStyles.btn} type="button">
                  Verify record
                </button>
              </form>
            </Paper>
          </div>

          <footer className={recipientStyles.footer}>
            <span className={recipientStyles.footerInner}>
              Secured by <Brand href="" muted size="sm" />
            </span>
          </footer>
        </div>
      </div>
    </section>
  );
}
