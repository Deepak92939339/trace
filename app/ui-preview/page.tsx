"use client";

import { notFound } from "next/navigation";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { Chip } from "@/components/ui/chip";
import { ReasonChip } from "@/components/ui/reason-chip";
import { Money } from "@/components/ui/money";
import { Kbd } from "@/components/ui/kbd";
import { Switch } from "@/components/ui/switch";
import { CheckboxCard } from "@/components/ui/checkbox-card";
import { Dialog } from "@/components/ui/dialog";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Brand } from "@/components/ui/brand";
import { B2Preview } from "./b2-preview";
import { B3Preview } from "./b3-preview";
import { B5Preview } from "./b5-preview";
import { B6Preview } from "./b6-preview";
import { B7Preview } from "./b7-preview";
import { B9Preview } from "./b9-preview";
import { B10aPreview } from "./b10a-preview";
import { B10cPreview } from "./b10c-preview";
import styles from "./ui-preview.module.css";

function ToastDemo() {
  const { showToast } = useToast();
  return (
    <Button
      variant="secondary"
      onClick={() => showToast("Revision 3 saved · fingerprint 7f3a91…c21e")}
    >
      Trigger Toast
    </Button>
  );
}

function PreviewContent() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [switchState, setSwitchState] = useState(false);
  const [checkboxState, setCheckboxState] = useState(true);
  const [loadingState, setLoadingState] = useState(true);

  return (
    <div className={styles.previewContainer}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div
            className={styles.row}
            style={{ justifyContent: "space-between" }}
          >
            <Brand size="md" />
            <span className={styles.sectionHint}>
              Dev-only Preview (/ui-preview)
            </span>
          </div>
          <h1 className={styles.title}>Trace UI Primitives (Batch B1)</h1>
          <p className={styles.sub}>
            Interactive testing harness for all foundation and primitive
            components.
          </p>
        </header>

        {/* 1. Buttons */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span>Buttons</span>
            <span className={styles.sectionHint}>
              primary | secondary | quiet | danger · sm | md | lg
            </span>
          </h2>

          <div className={styles.label}>Sizes &amp; Variants</div>
          <div className={styles.row}>
            <Button variant="primary" size="sm">
              Primary SM
            </Button>
            <Button variant="primary" size="md">
              Primary MD
            </Button>
            <Button variant="primary" size="lg">
              Primary LG
            </Button>
          </div>
          <div className={styles.row}>
            <Button variant="secondary" size="sm">
              Secondary SM
            </Button>
            <Button variant="secondary" size="md">
              Secondary MD
            </Button>
            <Button variant="secondary" size="lg">
              Secondary LG
            </Button>
          </div>
          <div className={styles.row}>
            <Button variant="quiet" size="sm">
              Quiet SM
            </Button>
            <Button variant="quiet" size="md">
              Quiet MD
            </Button>
            <Button variant="quiet" size="lg">
              Quiet LG
            </Button>
          </div>
          <div className={styles.row}>
            <Button variant="danger" size="sm">
              Danger SM
            </Button>
            <Button variant="danger" size="md">
              Danger MD
            </Button>
            <Button variant="danger" size="lg">
              Danger LG
            </Button>
          </div>

          <div className={styles.label}>
            States: Loading, Disabled &amp; Link
          </div>
          <div className={styles.row}>
            <Button
              variant="primary"
              loading={loadingState}
              onClick={() => setLoadingState(!loadingState)}
            >
              Loading Primary
            </Button>
            <Button variant="secondary" loading={loadingState}>
              Loading Secondary
            </Button>
            <Button variant="danger" loading={loadingState}>
              Loading Danger
            </Button>
            <Button
              variant="quiet"
              size="sm"
              onClick={() => setLoadingState(!loadingState)}
            >
              Toggle Loading
            </Button>
            <Button variant="primary" disabled>
              Disabled Primary
            </Button>
            <Button variant="secondary" disabled>
              Disabled Secondary
            </Button>
            <Button variant="secondary" href="#">
              Rendered as Link
            </Button>
          </div>
        </section>

        {/* 2. Status Pills */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span>StatusPills</span>
            <span className={styles.sectionHint}>
              QuoteState + accepted + buyer events
            </span>
          </h2>
          <div className={styles.label}>Quote States</div>
          <div className={styles.row}>
            <StatusPill state="draft" />
            <StatusPill state="waiting" />
            <StatusPill state="approved" />
            <StatusPill state="issued" />
            <StatusPill state="rejected" />
            <StatusPill state="expired" />
            <StatusPill state="accepted" />
          </div>

          <div className={styles.label}>States with Buyer Events</div>
          <div className={styles.row}>
            <StatusPill state="issued" buyerEvent="viewed" />
            <StatusPill state="issued" buyerEvent="change_requested" />
            <StatusPill state="issued" buyerEvent="declined" />
            <StatusPill state="accepted" buyerEvent="accepted" />
          </div>
        </section>

        {/* 3. Chips & Reason Chips */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span>Chips &amp; ReasonChips</span>
            <span className={styles.sectionHint}>
              Tones &amp; Approval Reason Codes
            </span>
          </h2>
          <div className={styles.label}>Generic Chips</div>
          <div className={styles.row}>
            <Chip tone="neutral">Neutral Chip</Chip>
            <Chip tone="amber">Amber Chip</Chip>
            <Chip tone="red">Red Chip</Chip>
            <Chip tone="green">Green Chip</Chip>
            <Chip tone="rev">Rev 3</Chip>
          </div>

          <div className={styles.label}>Approval Reason Chips</div>
          <div className={styles.row}>
            <ReasonChip code="discount_above_threshold" />
            <ReasonChip code="below_cost" />
            <ReasonChip code="margin_under_floor" />
            <ReasonChip code="successor_revision" />
            <ReasonChip code="custom_commercial_review" />
          </div>
        </section>

        {/* 4. Money */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span>Money</span>
            <span className={styles.sectionHint}>
              showCurrency (true/false) · True Minus (no space) · Tabular
            </span>
          </h2>

          <div className={styles.label}>With Currency (showCurrency=true)</div>
          <div className={styles.row}>
            <div>
              <span className={styles.sectionHint}>USD positive: </span>
              <Money minor={125000} currency="USD" />
            </div>
            <div>
              <span className={styles.sectionHint}>USD negative: </span>
              <Money minor={-104880} currency="USD" />
            </div>
            <div>
              <span className={styles.sectionHint}>USD signed always: </span>
              <Money minor={45000} currency="USD" signed="always" />
            </div>
            <div>
              <span className={styles.sectionHint}>USD zero: </span>
              <Money minor={0} currency="USD" />
            </div>
          </div>

          <div className={styles.label}>
            Without Currency (showCurrency=false)
          </div>
          <div className={styles.row}>
            <div>
              <span className={styles.sectionHint}>Positive decimal: </span>
              <Money minor={125000} currency="USD" showCurrency={false} />
            </div>
            <div>
              <span className={styles.sectionHint}>Negative decimal: </span>
              <Money minor={-104880} currency="USD" showCurrency={false} />
            </div>
            <div>
              <span className={styles.sectionHint}>
                Signed always decimal:{" "}
              </span>
              <Money
                minor={45000}
                currency="USD"
                showCurrency={false}
                signed="always"
              />
            </div>
            <div>
              <span className={styles.sectionHint}>Zero decimal: </span>
              <Money minor={0} currency="USD" showCurrency={false} />
            </div>
          </div>

          <div className={styles.label}>Multi-currency exponent support</div>
          <div className={styles.row}>
            <div>
              <span className={styles.sectionHint}>INR (2 dec): </span>
              <Money minor={450000} currency="INR" />
            </div>
            <div>
              <span className={styles.sectionHint}>JPY (0 dec): </span>
              <Money minor={52000} currency="JPY" />
            </div>
            <div>
              <span className={styles.sectionHint}>KWD (3 dec): </span>
              <Money minor={1250500} currency="KWD" />
            </div>
          </div>

          <div className={styles.label}>Sizes</div>
          <div className={styles.row}>
            <Money minor={45000} currency="USD" size="sm" />
            <Money minor={45000} currency="USD" size="md" />
            <Money minor={45000} currency="USD" size="lg" />
            <Money minor={-45000} currency="USD" size="lg" />
          </div>
        </section>

        {/* 5. Keyboard Hints (Kbd) */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span>Keyboard Hints (Kbd)</span>
            <span className={styles.sectionHint}>Desktop navigation cues</span>
          </h2>
          <div className={styles.row}>
            <span>
              <Kbd>⌘K</Kbd> Search
            </span>
            <span>
              <Kbd>J</Kbd> <Kbd>K</Kbd> Move
            </span>
            <span>
              <Kbd>A</Kbd> Approve
            </span>
            <span>
              <Kbd>R</Kbd> Reject
            </span>
            <span>
              <Kbd>Enter</Kbd> New row
            </span>
            <span>
              <Kbd>Tab</Kbd> Next cell
            </span>
            <span>
              <Kbd>Esc</Kbd> Close
            </span>
          </div>
        </section>

        {/* 6. Switch & CheckboxCard */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span>Controls: Switch &amp; CheckboxCard</span>
            <span className={styles.sectionHint}>
              Accessible toggle &amp; selection cards
            </span>
          </h2>
          <div className={styles.row} style={{ alignItems: "center", gap: 16 }}>
            <div className={styles.row} style={{ alignItems: "center" }}>
              <Switch
                checked={switchState}
                onChange={setSwitchState}
                aria-label="Demo switch"
              />
              <span style={{ fontSize: 13 }}>
                Switch ({switchState ? "ON" : "OFF"})
              </span>
            </div>
            <div className={styles.row} style={{ alignItems: "center" }}>
              <Switch checked={true} disabled aria-label="Disabled switch on" />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Disabled On
              </span>
            </div>
            <div className={styles.row} style={{ alignItems: "center" }}>
              <Switch
                checked={false}
                disabled
                aria-label="Disabled switch off"
              />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>
                Disabled Off
              </span>
            </div>
          </div>

          <div className={styles.grid2}>
            <CheckboxCard
              checked={checkboxState}
              onChange={setCheckboxState}
              title="Extended warranty, 24 months"
              description="Parts and labour on frames and couplings. Your total updates instantly."
              price="+ 450.00"
            />
            <CheckboxCard
              checked={false}
              onChange={() => {}}
              disabled
              title="Site delivery and assembly"
              description="Specialized transport with crane offload (unavailable for this region)."
              price="+ 800.00"
            />
          </div>
        </section>

        {/* 7. Dialog & Toast */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span>Overlay: Dialog &amp; Toast</span>
            <span className={styles.sectionHint}>
              Native &lt;dialog&gt; and bottom-centre notification
            </span>
          </h2>
          <div className={styles.row}>
            <Button variant="primary" onClick={() => setDialogOpen(true)}>
              Open Dialog
            </Button>
            <ToastDemo />
          </div>

          <Dialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            title="Accept Revision 3"
            description="You're accepting this proposal exactly as shown."
            footer={
              <>
                <Button variant="quiet" type="button" onClick={() => {}}>
                  Inside Action
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setDialogOpen(false)}>
                  Accept &amp; Pay Deposit
                </Button>
              </>
            }
          >
            <div>
              <p style={{ margin: "0 0 12px" }}>
                Both parties keep a verifiable record of this acceptance: your
                name, title, timestamp, and document fingerprint{" "}
                <code style={{ fontFamily: "var(--mono)" }}>7f3a91…c21e</code>.
              </p>
              <p style={{ margin: 0, color: "var(--muted)", fontSize: 12 }}>
                Click outside on the backdrop or press <Kbd>Esc</Kbd> to close.
              </p>
            </div>
          </Dialog>
        </section>

        {/* 8. Brand variants */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span>Brand Wordmark &amp; Mark</span>
            <span className={styles.sectionHint}>Sizes &amp; Tones</span>
          </h2>
          <div className={styles.row} style={{ gap: 24, alignItems: "center" }}>
            <div>
              <div className={styles.label}>Default (MD)</div>
              <Brand size="md" />
            </div>
            <div>
              <div className={styles.label}>Small (SM)</div>
              <Brand size="sm" />
            </div>
            <div>
              <div className={styles.label}>Muted</div>
              <Brand size="md" muted />
            </div>
            <div>
              <div className={styles.label}>Static (No link)</div>
              <Brand size="md" href="" />
            </div>
          </div>
        </section>

        <B2Preview />
        <B3Preview />
        <B5Preview />
        <B6Preview />
        <B7Preview />
        <B9Preview />
        <B10aPreview />
        <B10cPreview />
      </div>
    </div>
  );
}

export default function UIPreviewPage() {
  return (
    <ToastProvider>
      <PreviewContent />
    </ToastProvider>
  );
}
