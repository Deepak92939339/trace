"use client";
import { useState } from "react";
import { ProposalView } from "@/components/proposal/proposal-view";
import { AcceptanceReceipt } from "@/components/proposal/acceptance-receipt";
import {
  ChangeDialog,
  DeclineDialog,
  AcceptanceDialog,
} from "@/components/public-quotes/recipient-quote-client";
import { Brand } from "@/components/ui/brand";
import { portQuote, portAcceptance } from "./port-proposal-fixtures";
import styles from "@/components/public-quotes/recipient.module.css";

export function PortProposalPreview() {
  const [mode, setMode] = useState("proposal");
  const [dialog, setDialog] = useState<string | null>(null);
  const close = () => setDialog(null);
  return (
    <main id="main-content" className={styles.shell}>
      <header className={styles.header}>
        <Brand href="" size="sm" />
        <label>
          Fixture{" "}
          <select
            aria-label="Document preview"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="proposal">Proposal</option>
            <option value="receipt">Receipt</option>
            <option value="closed">Closed proposal</option>
          </select>
        </label>
      </header>
      {mode === "receipt" ? (
        <>
          <AcceptanceReceipt acceptance={portAcceptance} quote={portQuote} />
          <a id="quotation-document" href="#main-content">
            Fixture accepted quotation
          </a>
        </>
      ) : (
        <ProposalView
          quote={portQuote}
          canRespond={mode !== "closed"}
          onRequestChanges={() => setDialog("change")}
          onDecline={() => setDialog("decline")}
          onAccept={() => setDialog("accept")}
        />
      )}
      <ChangeDialog
        open={dialog === "change"}
        pending={false}
        status="idle"
        onClose={close}
        onSubmit={close}
      />
      <DeclineDialog
        open={dialog === "decline"}
        pending={false}
        status="idle"
        onClose={close}
        onSubmit={close}
      />
      <AcceptanceDialog
        open={dialog === "accept"}
        pending={false}
        status="idle"
        statement={portQuote.acceptanceStatement}
        onClose={close}
        onSubmit={close}
      />
    </main>
  );
}
