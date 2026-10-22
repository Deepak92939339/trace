"use client";

import { useState } from "react";
import {
  ApprovalsTable,
  type ApprovalRow,
} from "@/components/approvals/approvals-table";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import shell from "@/components/application/app-shell.module.css";

const rows: ApprovalRow[] = [
  {
    id: "fixture-1",
    version: 3,
    number: "TRC-2026-0142",
    href: "#fixture-1",
    customer: "Asha Engineering Works — exceptionally long customer name",
    discount: "12.00%",
    threshold: "10.00%",
    total: "USD 8,325.72",
    waiting: "2 hours",
    waitingIso: "2026-10-22T08:00:00Z",
    reasons: [
      "discount_above_threshold",
      "successor_revision",
      "margin_under_floor",
    ],
    submitter: "Meera Kapoor",
    revisionLabel: "Rev 3",
    diff: [
      {
        key: "discount",
        label: "Discount",
        before: "8.00%",
        after: "12.00%",
        delta: null,
        direction: "up",
      },
      {
        key: "total",
        label: "Total USD",
        before: "8,704.17",
        after: "8,325.72",
        delta: "−378.45",
        direction: "down",
      },
    ],
    history: [
      {
        id: "history-1",
        title: "Rev 3 submitted",
        actor: "Meera Kapoor",
        at: "2026-10-22T08:00:00Z",
        atLabel: "2 hours ago",
        type: "submitted",
      },
    ],
    margin: {
      value: "27.8%",
      floor: "18.0%",
      tone: "green",
      linesWithoutCost: 1,
      percent: 27.8,
      floorPercent: 18,
    },
  },
  {
    id: "fixture-2",
    version: 1,
    number: "TRC-2026-0139",
    href: "#fixture-2",
    customer: "Halden Marine Supply",
    discount: "5.00%",
    threshold: null,
    total: "USD 1,200.00",
    waiting: "1 day",
    waitingIso: "2026-10-21T08:00:00Z",
    reasons: ["successor_revision"],
    submitter: "Priya Raman",
    revisionLabel: "Rev 1",
    diff: null,
    history: [],
    margin: null,
  },
  {
    id: "fixture-3",
    version: 2,
    number: "TRC-2026-0137",
    href: "#fixture-3",
    customer: null,
    discount: "0.00%",
    threshold: null,
    total: "USD 450.00",
    waiting: "Unknown",
    waitingIso: null,
    reasons: [],
    submitter: null,
    revisionLabel: "Rev 2",
    diff: [],
    history: [],
    margin: null,
  },
];

export function PortApprovalsPreview() {
  const [scenario, setScenario] = useState("manager");
  return (
    <div className={shell.app}>
      <AppSidebar
        organizationName="Northline Fabrication Ltd"
        displayName="Commercial reviewer"
        roleLabel={scenario === "reviewer" ? "Read only" : "Manager"}
        counts={{ approvals: 3 }}
        signOutAction={() => {}}
      />
      <div className={shell.main}>
        <TopBar
          breadcrumbs={[{ label: "Approvals" }]}
          actions={
            <label>
              Fixture{" "}
              <select
                aria-label="Preview scenario"
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
              >
                <option value="manager">Manager</option>
                <option value="reviewer">Read-only / no margin</option>
                <option value="empty">Empty queue</option>
              </select>
            </label>
          }
        />
        <main id="main-content" className={`app-main ${shell.appMain}`}>
          <ApprovalsTable
            key={scenario}
            rows={
              scenario === "empty"
                ? []
                : scenario === "reviewer"
                  ? rows.map((row) => ({ ...row, margin: null }))
                  : rows
            }
            canDecide={scenario !== "reviewer"}
          />
        </main>
      </div>
    </div>
  );
}
