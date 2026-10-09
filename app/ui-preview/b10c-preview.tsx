"use client";

import React from "react";
import { PaymentScheduleEditor } from "@/components/quotes/builder/payment-schedule-editor";
import { IssuedPrintDocument } from "@/components/quotes/issued-print-document";
import proposalStyles from "@/components/proposal/proposal-view.module.css";
import styles from "./b3-preview.module.css";

const SAMPLE_SCHEDULE_3ROWS = [
  {
    label: "Deposit",
    basis_points: 5000,
    trigger: "on_acceptance" as const,
    due_date: null,
  },
  {
    label: "Delivery",
    basis_points: 3000,
    trigger: "on_delivery" as const,
    due_date: null,
  },
  {
    label: "Completion",
    basis_points: 2000,
    trigger: "on_completion" as const,
    due_date: null,
  },
];

const SAMPLE_SCHEDULE_70PCT = [
  {
    label: "Initial share",
    basis_points: 4000,
    trigger: "on_acceptance" as const,
    due_date: null,
  },
  {
    label: "Midway share",
    basis_points: 3000,
    trigger: "on_delivery" as const,
    due_date: null,
  },
];

export function B10cPreview() {
  return (
    <section className={styles.section} aria-labelledby="b10c-title">
      <h2 id="b10c-title" className={styles.title}>
        <span>Payment schedule UI (B10c)</span>
        <span className={styles.hint}>
          PaymentScheduleEditor · Proposal Schedule · Print Schedule
        </span>
      </h2>

      {/* 1. Empty state */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          1. Builder: Empty schedule state
        </h3>
        <div style={{ maxWidth: 840 }}>
          <PaymentScheduleEditor
            quoteId="preview-quote-empty"
            expectedVersion={1}
            issueDate="2026-10-06"
            totalMinor={832572}
            currencyCode="USD"
            locale="en-US"
            initialSchedule={[]}
            editable={true}
          />
        </div>
      </div>

      {/* 2. 50/30/20 on 8,325.72 with derived amounts */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          2. Builder: 50/30/20 schedule on $8,325.72 ($4,162.86 / $2,497.72 / $1,665.14)
        </h3>
        <div style={{ maxWidth: 840 }}>
          <PaymentScheduleEditor
            quoteId="preview-quote-3rows"
            expectedVersion={2}
            issueDate="2026-10-06"
            totalMinor={832572}
            currencyCode="USD"
            locale="en-US"
            initialSchedule={SAMPLE_SCHEDULE_3ROWS}
            editable={true}
          />
        </div>
      </div>

      {/* 3. Invalid total (70.00%) */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          3. Builder: Shares totaling 70.00% (amber note, disabled save/submit)
        </h3>
        <div style={{ maxWidth: 840 }}>
          <PaymentScheduleEditor
            quoteId="preview-quote-invalid"
            expectedVersion={3}
            issueDate="2026-10-06"
            totalMinor={832572}
            currencyCode="USD"
            locale="en-US"
            initialSchedule={SAMPLE_SCHEDULE_70PCT}
            editable={true}
          />
        </div>
      </div>

      {/* 4. Read-only presentation */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          4. Builder: Read-only presentation (non-editable or non-draft)
        </h3>
        <div style={{ maxWidth: 840 }}>
          <PaymentScheduleEditor
            quoteId="preview-quote-readonly"
            expectedVersion={4}
            issueDate="2026-10-06"
            totalMinor={832572}
            currencyCode="USD"
            locale="en-US"
            initialSchedule={SAMPLE_SCHEDULE_3ROWS}
            editable={false}
          />
        </div>
      </div>

      {/* 5. Proposal table sample */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          5. Proposal: Buyer presentation table
        </h3>
        <div
          style={{
            maxWidth: 680,
            background: "var(--paper)",
            border: "1px solid var(--paper-edge)",
            padding: 24,
            borderRadius: "var(--r-paper)",
          }}
        >
          <section className={proposalStyles.schedule}>
            <div className={proposalStyles.secH}>
              <h2>Payment schedule</h2>
              <span>When payment is due</span>
            </div>
            <table className={proposalStyles.scheduleTable}>
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Share</th>
                  <th className={proposalStyles.r}>Amount</th>
                  <th className={proposalStyles.r}>Due</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td data-label="Milestone">Deposit</td>
                  <td data-label="Share">50.00%</td>
                  <td data-label="Amount" className={proposalStyles.r}>$4,162.86</td>
                  <td data-label="Due" className={proposalStyles.r}>Due on acceptance</td>
                </tr>
                <tr>
                  <td data-label="Milestone">Delivery</td>
                  <td data-label="Share">30.00%</td>
                  <td data-label="Amount" className={proposalStyles.r}>$2,497.72</td>
                  <td data-label="Due" className={proposalStyles.r}>Due on delivery</td>
                </tr>
                <tr>
                  <td data-label="Milestone">Completion</td>
                  <td data-label="Share">20.00%</td>
                  <td data-label="Amount" className={proposalStyles.r}>$1,665.14</td>
                  <td data-label="Due" className={proposalStyles.r}>Due on completion</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>

      {/* 6. Print document schedule sample */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          6. Print document: Payment schedule section
        </h3>
        <div style={{ maxWidth: 840, border: "1px solid var(--line)", borderRadius: "var(--r-panel)", padding: 16, background: "var(--surface)" }}>
          <IssuedPrintDocument
            quote={{
              number: "TND-2026-0042",
              issueDate: "2026-10-06",
              validUntil: "2026-11-06",
              currencyCode: "USD",
              locale: "en-US",
              taxLabel: "Tax (10%)",
              taxMode: "exclusive",
              notes: "Payment due per schedule.",
              subtotalMinor: 756884,
              discountMinor: 0,
              taxMinor: 75688,
              chargesMinor: 0,
              chargeNetMinor: 0,
              totalMinor: 832572,
              issuedAt: "2026-10-06T09:00:00Z",
            }}
            seller={{
              legalName: "Acme Industrial Supplies Ltd",
              addressLine1: "100 Industrial Parkway",
              addressLine2: null,
              city: "Chicago",
              region: "IL",
              postalCode: "60601",
              countryCode: "US",
              taxIdentifier: "US-123456789",
              contactEmail: "sales@acme.example",
              contactPhone: "+1 312 555 0100",
            }}
            customer={{
              name: "Global Logistics Corp",
              contactName: "Jane Doe",
              email: "jane@globallogistics.example",
              address: "200 Trade Center, New York, NY 10001",
              taxIdentifier: "US-987654321",
            }}
            items={[
              {
                id: "item-1",
                position: 1,
                sku: "CONV-BELT-01",
                description: "Heavy-duty conveyor belt 50m",
                unitCode: "m",
                quantityScaled: 50,
                quantityScale: 1,
                unitPriceMinor: 1513768,
                taxCode: "STANDARD",
                extendedAmountMinor: 756884,
              },
            ]}
            charges={[]}
            paymentSchedule={[
              {
                position: 1,
                label: "Deposit",
                percentDisplay: "50.00%",
                amountDisplay: "$4,162.86",
                trigger: "on_acceptance",
                dueText: "Due on acceptance",
                dueDate: null,
              },
              {
                position: 2,
                label: "Delivery",
                percentDisplay: "30.00%",
                amountDisplay: "$2,497.72",
                trigger: "on_delivery",
                dueText: "Due on delivery",
                dueDate: null,
              },
              {
                position: 3,
                label: "Completion",
                percentDisplay: "20.00%",
                amountDisplay: "$1,665.14",
                trigger: "on_completion",
                dueText: "Due on completion",
                dueDate: null,
              },
            ]}
            issuedActor="Alice Walker"
          />
        </div>
      </div>
    </section>
  );
}
