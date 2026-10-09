"use client";

import React from "react";
import { AcceptanceReceipt } from "@/components/proposal/acceptance-receipt";
import type { AcceptanceProjection } from "@/lib/quotes/commitment-contracts";
import type { RecipientQuoteViewModel } from "@/lib/public-quotes/view-model";
import styles from "./b3-preview.module.css";

const FIXTURE_QUOTE: RecipientQuoteViewModel = {
  quoteNumber: "TRC-2026-0142",
  revisionNumber: 3,
  effectiveState: "accepted",
  responseType: "accepted",
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
      description: "Steel mounting frame, custom",
      quantity_scaled: 4000,
      quantity_scale: 1000,
      unit_code: "EA",
      tax_code: "Standard",
      unitPriceDisplay: "1,250.00",
      lineAmountDisplay: "5,000.00",
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
  notes: null,
  snapshotHash:
    "7f3a91b2c4d5e6f7a8b9c0d1e2f3a4b57f3a91b2c4d5e6f7a8b9c0d1e2f3a4b5",
  calculationFingerprint:
    "c21e3f4a5b6c7d8e9f0a1b2c3d4e5f6ac21e3f4a5b6c7d8e9f0a1b2c3d4e5f6a",
  acceptanceStatementVersion: 1,
  acceptanceStatement:
    "Both parties keep a record of this acceptance: your name and title, the time, and the document fingerprint.",
} as unknown as RecipientQuoteViewModel;

const FIXTURE_ACCEPTANCE_STANDARD: AcceptanceProjection = {
  acceptanceId: "acc-142",
  shareLinkId: "link-142",
  recipientEventId: "evt-142",
  quoteId: "quote-142",
  revisionId: "rev-3",
  acceptedAt: "2026-10-03T08:32:00.000Z",
  snapshotHash:
    "7f3a91b2c4d5e6f7a8b9c0d1e2f3a4b57f3a91b2c4d5e6f7a8b9c0d1e2f3a4b5",
  calculationFingerprint:
    "c21e3f4a5b6c7d8e9f0a1b2c3d4e5f6ac21e3f4a5b6c7d8e9f0a1b2c3d4e5f6a",
  recipientEmailSnapshot: "priya@asha.example",
  buyerAssertedName: "Priya Raman",
  buyerAssertedTitle: "Procurement lead",
  acceptanceStatementVersion: 1,
  acceptanceStatement:
    "Both parties keep a record of this acceptance: your name and title, the time, and the document fingerprint.",
  acceptanceStatementHash:
    "e5a3b2c1d4f6a7b8c9d0e1f2a3b4c5d6e5a3b2c1d4f6a7b8c9d0e1f2a3b4c5d6",
  replayed: false,
};

const FIXTURE_ACCEPTANCE_REPLAYED: AcceptanceProjection = {
  acceptanceId: "acc-143",
  shareLinkId: "link-143",
  recipientEventId: "evt-143",
  quoteId: "quote-142",
  revisionId: "rev-3",
  acceptedAt: "2026-10-03T08:32:00.000Z",
  snapshotHash:
    "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
  calculationFingerprint:
    "d4e5f6a1b2c37890d4e5f6a1b2c37890d4e5f6a1b2c37890d4e5f6a1b2c37890",
  recipientEmailSnapshot: "david@apex.example",
  buyerAssertedName: "David Vance",
  buyerAssertedTitle: null,
  acceptanceStatementVersion: 1,
  acceptanceStatement:
    "Both parties keep a record of this acceptance: your name and title, the time, and the document fingerprint.",
  acceptanceStatementHash:
    "90a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f678",
  replayed: true,
};

export function B6Preview() {
  return (
    <section className={styles.section} aria-labelledby="b6-title">
      <h2 id="b6-title" className={styles.title}>
        <span>Acceptance receipt (B6)</span>
        <span className={styles.hint}>
          AcceptanceReceipt · Standard & Replayed Variants
        </span>
      </h2>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          Variant 1: Standard Acceptance (replayed: false)
        </h3>
        <AcceptanceReceipt
          acceptance={FIXTURE_ACCEPTANCE_STANDARD}
          quote={FIXTURE_QUOTE}
        />
      </div>

      <div style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          Variant 2: Replayed Acceptance without title (replayed: true, buyerAssertedTitle: null)
        </h3>
        <AcceptanceReceipt
          acceptance={FIXTURE_ACCEPTANCE_REPLAYED}
          quote={FIXTURE_QUOTE}
        />
      </div>
    </section>
  );
}
