"use client";

import React from "react";
import { ApprovalsTable, type ApprovalRow } from "@/components/approvals/approvals-table";
import styles from "./b3-preview.module.css";

const FIXTURE_ROWS: ApprovalRow[] = [
  {
    id: "appr-1",
    version: 1,
    number: "TRC-2026-0139",
    href: "/quotes/TRC-2026-0139",
    customer: "Kirloskar Precision Systems",
    discount: "15.00%",
    threshold: null,
    total: "₹1,24,500.00",
    waiting: "1 day ago",
    waitingIso: "2026-10-02T10:00:00Z",
    reasons: ["discount_above_threshold"],
    submitter: "James Okafor",
    revisionLabel: "Rev 1",
    diff: null,
    history: [
      {
        id: "h1-1",
        title: "Quotation submitted for manager approval",
        actor: "James Okafor",
        at: "2026-10-02T10:00:00Z",
        atLabel: "2 Oct 2026, 10:00",
        type: "quote.submitted",
      },
      {
        id: "h1-2",
        title: "Draft created from catalog import",
        actor: "James Okafor",
        at: "2026-10-01T15:30:00Z",
        atLabel: "1 Oct 2026, 15:30",
        type: "quote.created",
      },
    ],
  },
  {
    id: "appr-2",
    version: 2,
    number: "TRC-2026-0140",
    href: "/quotes/TRC-2026-0140",
    customer: "Apex Tooling Solutions",
    discount: "12.50%",
    threshold: "10.00%",
    total: "$8,450.00",
    waiting: "3 days ago",
    waitingIso: "2026-09-30T14:30:00Z",
    reasons: ["discount_above_threshold", "successor_revision"],
    submitter: "Meera Kapoor",
    revisionLabel: "Rev 2",
    diff: [
      {
        key: "discount",
        label: "Discount",
        before: "10.00%",
        after: "12.50%",
        delta: null,
        direction: null,
      },
      {
        key: "total",
        label: "Total",
        before: "$8,200.00",
        after: "$8,450.00",
        delta: "+$250.00",
        direction: "up",
      },
    ],
    history: [
      {
        id: "h2-1",
        title: "Rev 2 submitted by Meera Kapoor",
        actor: "Meera Kapoor",
        at: "2026-09-30T14:30:00Z",
        atLabel: "30 Sep 2026, 14:30",
        type: "quote.submitted",
      },
      {
        id: "h2-2",
        title: "Rev 1 approved automatically and issued",
        actor: "System",
        at: "2026-09-25T09:00:00Z",
        atLabel: "25 Sep 2026, 09:00",
        type: "quote.approved",
      },
    ],
  },
  {
    id: "appr-3",
    version: 3,
    number: "TRC-2026-0142",
    href: "/quotes/TRC-2026-0142",
    customer: "Asha Engineering Works",
    discount: "12.00%",
    threshold: "10.00%",
    total: "$8,325.72",
    waiting: "2 hours ago",
    waitingIso: "2026-10-03T18:00:00Z",
    reasons: ["discount_above_threshold"],
    submitter: "Meera Kapoor",
    revisionLabel: "Rev 3",
    diff: [
      {
        key: "discount",
        label: "Discount",
        before: "8.00%",
        after: "12.00%",
        delta: null,
        direction: null,
      },
      {
        key: "total",
        label: "Total",
        before: "$8,704.17",
        after: "$8,325.72",
        delta: "−$378.45",
        direction: "down",
      },
    ],
    history: [
      {
        id: "h3-1",
        title: "Rev 3 submitted by Meera Kapoor",
        actor: "Meera Kapoor",
        at: "2026-10-03T18:00:00Z",
        atLabel: "3 Oct 2026, 18:00",
        type: "quote.submitted",
      },
      {
        id: "h3-2",
        title: "Buyer requested changes on Rev 2",
        actor: "Asha Engineering Works",
        at: "2026-10-02T16:40:00Z",
        atLabel: "2 Oct 2026, 16:40",
        type: "quote.change_requested",
      },
    ],
  },
];

export function B7Preview() {
  return (
    <section className={styles.section} aria-labelledby="b7-title">
      <h2 id="b7-title" className={styles.title}>
        <span>Approvals queue (B7)</span>
        <span className={styles.hint}>
          ApprovalsTable · Active, Empty & Read-Only Variants
        </span>
      </h2>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          Variant 1: Active decision queue (canDecide = true)
        </h3>
        <ApprovalsTable rows={FIXTURE_ROWS} canDecide={true} />
      </div>

      <div style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          Variant 2: Empty queue (0 waiting)
        </h3>
        <ApprovalsTable rows={[]} canDecide={true} />
      </div>

      <div style={{ marginTop: 40 }}>
        <h3 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
          Variant 3: Read-only decision queue (canDecide = false)
        </h3>
        <ApprovalsTable rows={FIXTURE_ROWS} canDecide={false} />
      </div>
    </section>
  );
}
