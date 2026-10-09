"use client";

import React, { useState } from "react";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { PageHeader } from "@/components/shell/page-header";
import {
  CommandPalette,
  type CommandGroup,
} from "@/components/shell/command-palette";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import styles from "./b3-preview.module.css";

const FIXTURE_COMMAND_GROUPS: CommandGroup[] = [
  {
    name: "Quotes",
    items: [
      {
        id: "q-142",
        label: "TRC-2026-0142 · Custom mounting system for Line 4",
        detail: "Asha Engineering Works · USD 8,325.72",
        badge: "Rev 3",
        meta: "Draft",
        onSelect: () => {},
      },
      {
        id: "q-141",
        label: "TRC-2026-0141 · Structural steel brackets",
        detail: "Apex Industrial Logistics · USD 4,120.00",
        badge: "Rev 1",
        meta: "Issued",
        onSelect: () => {},
      },
      {
        id: "q-139",
        label: "TRC-2026-0139 · Precision feed rail assembly",
        detail: "Kaveri Dynamics · USD 12,850.00",
        badge: "Rev 2",
        meta: "Accepted",
        onSelect: () => {},
      },
    ],
  },
  {
    name: "Customers",
    items: [
      {
        id: "c-1",
        label: "Asha Engineering Works",
        detail: "Priya Raman · Procurement lead",
        meta: "4 quotes",
        onSelect: () => {},
      },
      {
        id: "c-2",
        label: "Apex Industrial Logistics",
        detail: "David Vance · Plant manager",
        meta: "1 quote",
        onSelect: () => {},
      },
    ],
  },
  {
    name: "Catalog",
    items: [
      {
        id: "cat-1",
        label: "Steel mounting frame, custom",
        detail: "SKU-4401 · Welded structural tubular frame",
        meta: "1,250.00 / EA",
        onSelect: () => {},
      },
      {
        id: "cat-2",
        label: "Stainless feed rail",
        detail: "SKU-4402 · Grade 316 guide rail",
        meta: "85.00 / M",
        onSelect: () => {},
      },
    ],
  },
  {
    name: "Actions",
    items: [
      {
        id: "act-new",
        label: "Prepare the offer",
        detail: "Create a new quotation from scratch",
        onSelect: () => {},
      },
      {
        id: "act-approvals",
        label: "Commercial review queue",
        detail: "Open pending discount approvals",
        meta: "3 waiting",
        onSelect: () => {},
      },
    ],
  },
];

export function B3Preview() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <section className={styles.section} aria-labelledby="b3-title">
      <h2 id="b3-title" className={styles.title}>
        <span>Shell (B3)</span>
        <span className={styles.hint}>
          AppSidebar · TopBar · PageHeader · CommandPalette
        </span>
      </h2>

      <div className={styles.controlsRow}>
        <div className={styles.controlsLeft}>
          <Button
            variant="secondary"
            onClick={() => setPaletteOpen(true)}
            id="openPaletteBtn"
          >
            Open Command Palette
          </Button>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            or press <Kbd>⌘K</Kbd> / <Kbd>Ctrl+K</Kbd>
          </span>
        </div>
      </div>

      <div className={styles.shellFrame}>
        <AppSidebar
          organizationName="Northline Fabrication"
          organizationRole="Workspace"
          displayName="Meera Kapoor"
          roleLabel="Sales manager"
          canManageOrganization={true}
          counts={{ quotes: 24, approvals: 3 }}
          signOutAction={() => {}}
          className={styles.previewSidebar}
        />

        <div className={styles.shellMain}>
          <TopBar
            breadcrumbs={[
              { label: "Quotes", href: "#quotes" },
              { label: "TRC-2026-0142", isCurrent: true },
            ]}
            onSearchClick={() => setPaletteOpen(true)}
            actions={
              <>
                <Button variant="secondary" size="sm">
                  Save draft
                </Button>
                <Button variant="primary" size="sm">
                  Submit for approval
                </Button>
              </>
            }
          />

          <PageHeader
            quoteId="TRC-2026-0142"
            statusState="draft"
            revChip="Rev 3"
            title="Custom mounting system for Line 4"
            subtitle="Asha Engineering Works · created from Rev 2 by Meera Kapoor"
            rightSlot={
              <span className={styles.saveState}>
                <span className={styles.saveDot} />
                Saved 12s ago
              </span>
            }
          />

          <div className={styles.mockBody}>
            <div className={styles.mockPanel}>
              <strong>Workbench Body Content Area</strong>
              <p style={{ margin: "6px 0 0" }}>
                Terms strip, LineGrid, and Paper live preview render here under
                the PageHeader.
              </p>
            </div>
          </div>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onToggle={() => setPaletteOpen((prev) => !prev)}
        groups={FIXTURE_COMMAND_GROUPS}
      />
    </section>
  );
}
