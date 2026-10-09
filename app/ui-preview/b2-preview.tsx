"use client";

import type { QuoteRevisionProjection } from "@/lib/quotes/commitment-contracts";
import { Paper } from "@/components/paper/paper";
import { Letterhead } from "@/components/paper/letterhead";
import { Stamp, shortFingerprint } from "@/components/paper/stamp";
import { RevisionRail } from "@/components/paper/revision-rail";
import { MathPopover } from "@/components/paper/math-popover";
import { Money } from "@/components/ui/money";
import styles from "./b2-preview.module.css";

const HASH_R3 =
  "7f3a91c04be2d8a6f0c3d1e95b7a2c4e8d6f1a0b3c5e7d9f2a4c6e8b0d2fc21e";
const HASH_R2 =
  "4c19e2aa71d0b8c3e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b69d3a";
const HASH_R1 =
  "a07be5d3c2f1e0d9c8b7a6f5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e612";

function revision(
  n: number,
  hash: string,
  state: QuoteRevisionProjection["effectiveState"],
  issuedAt: string,
): QuoteRevisionProjection {
  return {
    id: `rev-${n}`,
    quoteId: "quote-142",
    quoteNumber: "TRC-2026-0142",
    revisionNumber: n,
    recordKind: "verified_revision",
    state: state === "accepted" || state === "expired" ? "issued" : state,
    effectiveState: state,
    parentRevisionId: n > 1 ? `rev-${n - 1}` : null,
    legacySourceRevisionId: null,
    snapshotFormatVersion: 1,
    calculationFormatVersion: 1,
    calculationFingerprint: hash,
    snapshotHash: hash,
    currencyCode: "USD",
    totalMinor: null,
    validUntil: "2026-11-14",
    requiresManualApproval: n === 3,
    approvalReasonCodes: n === 3 ? ["discount_above_threshold"] : [],
    submittedAt: issuedAt,
    approvedAt: issuedAt,
    rejectedAt: null,
    issuedAt,
    verificationCode: null,
    legacyCapturedAt: null,
  };
}

const REVISIONS = [
  revision(1, HASH_R1, "issued", "2026-09-27T09:10:00Z"),
  revision(2, HASH_R2, "issued", "2026-09-30T11:40:00Z"),
  revision(3, HASH_R3, "accepted", "2026-10-01T08:30:00Z"),
];

/* Fixture values match the mockups and were produced by the integer kernel — nothing is computed here. */
const LINES = [
  {
    key: "1",
    label: "Steel mounting frame, custom",
    detail: "4 EA × 1,250.00",
    amountMinor: 500000,
  },
  {
    key: "2",
    label: "Stainless feed rail",
    detail: "12 M × 85.00",
    amountMinor: 102000,
  },
  {
    key: "3",
    label: "Precision coupling assembly",
    detail: "6 EA × 340.00",
    amountMinor: 204000,
  },
  {
    key: "4",
    label: "Powder coating, RAL 7016",
    detail: "1 EA × 680.00",
    amountMinor: 68000,
  },
];
const ADJUSTMENTS = [
  {
    key: "disc",
    label: "Discount 12.00% (per line, half-up)",
    amountMinor: -104880,
  },
  {
    key: "tax",
    label: "Sales tax 8.25% (per line, half-up)",
    amountMinor: 63452,
  },
];

export function B2Preview() {
  return (
    <section className={styles.section} aria-labelledby="b2-title">
      <h2 id="b2-title" className={styles.title}>
        Paper &amp; signature motifs (B2)
        <span className={styles.hint}>
          Paper · Letterhead · DoubleRule · Stamp · RevisionRail · Show the math
        </span>
      </h2>

      <div className={styles.stamps}>
        <Stamp variant="draft" prefix="Rev 3" />
        <Stamp
          variant="approved"
          prefix="Rev 3"
          fingerprint={shortFingerprint(HASH_R3)}
          rotate={-2}
        />
        <Stamp
          variant="issued"
          prefix="Rev 3"
          fingerprint={shortFingerprint(HASH_R3)}
          rotate={3}
        />
        <Stamp
          variant="accepted"
          prefix="Rev 3"
          fingerprint={shortFingerprint(HASH_R3)}
        />
        <Stamp variant="paid" prefix="Deposit" rotate={-6} />
        <Stamp variant="rejected" prefix="Rev 2" rotate={2} />
      </div>

      <div className={styles.layout}>
        <Paper
          as="article"
          padding="lg"
          aria-label="Specimen proposal"
          className={styles.paper}
        >
          <span className={styles.stampSpot}>
            <Stamp
              variant="accepted"
              prefix="Rev 3"
              fingerprint={shortFingerprint(HASH_R3)}
            />
          </span>
          <Letterhead
            size="lg"
            sellerName="Northline Fabrication Ltd"
            addressLines={[
              "Unit 7, Riverside Works",
              "Sheffield S3 8DT, United Kingdom",
            ]}
            documentType="Proposal"
            documentNumber="TRC-2026-0142"
            metaLines={[
              "Revision 3 · issued 1 Oct 2026",
              "Valid until 14 Nov 2026",
            ]}
          />
          <h3 className={styles.docTitle}>Custom mounting system for Line 4</h3>
          <div className={styles.totals}>
            <div>
              <span>Subtotal</span>
              <Money
                minor={874000}
                currency="USD"
                locale="en-US"
                showCurrency={false}
              />
            </div>
            <div>
              <span>Discount 12.00%</span>
              <Money
                minor={-104880}
                currency="USD"
                locale="en-US"
                showCurrency={false}
              />
            </div>
            <div>
              <span>Sales tax 8.25%</span>
              <Money
                minor={63452}
                currency="USD"
                locale="en-US"
                showCurrency={false}
              />
            </div>
            <div className={styles.grand}>
              <span>
                Total
                <MathPopover
                  currency="USD"
                  locale="en-US"
                  lines={LINES}
                  adjustments={ADJUSTMENTS}
                  totalMinor={832572}
                />
              </span>
              <Money minor={832572} currency="USD" locale="en-US" size="lg" />
            </div>
          </div>
        </Paper>

        <aside className={styles.railBox}>
          <RevisionRail
            revisions={REVISIONS}
            currentRevisionId="rev-3"
            acceptedRevisionId="rev-3"
            hrefFor={(r) => `#revision-${r.revisionNumber}`}
          />
        </aside>
      </div>
    </section>
  );
}
