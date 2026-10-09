import React from "react";
import { Paper } from "@/components/paper/paper";
import { Letterhead } from "@/components/paper/letterhead";
import { Stamp, shortFingerprint } from "@/components/paper/stamp";
import { stateLabel } from "@/components/public-quotes/state-label";
import type { RecipientQuoteViewModel } from "@/lib/public-quotes/view-model";
import styles from "./proposal-view.module.css";

export type ProposalViewProps = {
  quote: RecipientQuoteViewModel;
  canRespond: boolean;
  onRequestChanges: () => void;
  onDecline: () => void;
  onAccept: () => void;
};

function getChipToneClass(quote: RecipientQuoteViewModel): string {
  const label = stateLabel(quote);
  if (label === "Accepted") return styles.stateAccepted ?? "";
  if (label === "Declined") return styles.stateDeclined ?? "";
  if (label === "Change request recorded") return styles.stateChangeRequested ?? "";
  if (label === "Issued") return styles.stateIssued ?? "";
  if (label === "expired" || quote.effectiveState === "expired") return styles.stateExpired ?? "";
  return styles.stateDefault ?? "";
}

function quantity(
  item: RecipientQuoteViewModel["items"][number],
  locale: string,
) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.round(Math.log10(item.quantity_scale)),
  }).format(item.quantity_scaled / item.quantity_scale);
}

export function ProposalView({
  quote,
  canRespond,
  onRequestChanges,
  onDecline,
  onAccept,
}: ProposalViewProps) {
  const stampVariant = quote.responseType === "accepted" ? "accepted" : "issued";

  return (
    <>
      <div className={styles.sheetWrap}>
        <Paper
          padding="lg"
          as="article"
          className={`recipient-document ${styles.doc}`}
          aria-label="Proposal document"
          {...({ id: "quotation-document" } as { id?: string })}
        >
          <Letterhead
            sellerName={quote.seller.legal_name}
            addressLines={[
              quote.seller.address_line1,
              quote.seller.address_line2,
              quote.seller.city,
              quote.seller.region,
              quote.seller.postal_code,
              quote.seller.country_code,
            ].filter(Boolean)}
            documentType="Quotation"
            documentNumber={`Revision ${quote.revisionNumber}`}
            metaLines={[
              `Issued ${quote.issueDate}`,
              `Valid until ${quote.validUntil}`,
            ]}
          />

          <div className={styles.titleRow}>
            <h1 className={styles.title}>{quote.quoteNumber}</h1>
            <span className={`${styles.stateChip} ${getChipToneClass(quote)}`}>
              {stateLabel(quote)}
            </span>
          </div>

          {quote.notes ? (
            <section className={styles.notes}>
              <h2>Commercial notes</h2>
              <p>{quote.notes}</p>
            </section>
          ) : null}

          <div className={styles.parties}>
            <address>
              <span className={styles.eyebrow}>Prepared for</span>
              <b>{quote.buyer.name}</b>
              <span>
                {[
                  quote.buyer.contact_name,
                  quote.buyer.email,
                  quote.buyer.address_line1,
                  quote.buyer.address_line2,
                  quote.buyer.city,
                  quote.buyer.region,
                  quote.buyer.postal_code,
                  quote.buyer.country_code,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </address>
          </div>

          <div className={styles.secH}>
            <h2>Scope and price</h2>
            <span>{quote.taxLabel}</span>
          </div>

          <table className={styles.lines}>
            <thead>
              <tr>
                <th>Item</th>
                <th className={styles.r}>Quantity</th>
                <th className={styles.r}>Unit price</th>
                <th className={styles.r}>Tax</th>
                <th className={styles.r}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Item">
                    <strong>{item.sku}</strong>
                    <span className={styles.spec}>{item.description}</span>
                  </td>
                  <td data-label="Quantity" className={styles.r}>
                    {quantity(item, quote.locale)} {item.unit_code}
                  </td>
                  <td data-label="Unit price" className={styles.r}>
                    {item.unitPriceDisplay}
                  </td>
                  <td data-label="Tax" className={styles.r}>
                    {item.tax_code}
                  </td>
                  <td data-label="Amount" className={styles.r}>
                    {item.lineAmountDisplay}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {quote.charges.length > 0 && (
            <section className={styles.charges}>
              <div className={styles.secH}>
                <h2>Charges (incl. tax)</h2>
              </div>
              {quote.charges.map((charge) => (
                <p key={charge.id}>
                  <span>{charge.description}</span>
                  <strong>{charge.totalDisplay}</strong>
                </p>
              ))}
            </section>
          )}

          <dl className={styles.totals}>
            <div>
              <dt>Subtotal</dt>
              <dd>{quote.totals.subtotal}</dd>
            </div>
            <div>
              <dt>Discount</dt>
              <dd>− {quote.totals.discount}</dd>
            </div>
            <div>
              <dt>{quote.taxLabel}</dt>
              <dd>{quote.totals.tax}</dd>
            </div>
            <div>
              <dt>Charges</dt>
              <dd>{quote.totals.charges}</dd>
            </div>
            <div className={styles.grand}>
              <dt>Total</dt>
              <dd>{quote.totals.total}</dd>
            </div>
          </dl>

          {quote.paymentSchedule && quote.paymentSchedule.length > 0 && (
            <section
              className={styles.schedule}
              aria-labelledby="proposal-schedule-heading"
            >
              <div className={styles.secH}>
                <h2 id="proposal-schedule-heading">Payment schedule</h2>
                <span>When payment is due</span>
              </div>
              <table className={styles.scheduleTable}>
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th>Share</th>
                    <th className={styles.r}>Amount</th>
                    <th className={styles.r}>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.paymentSchedule.map((row) => (
                    <tr key={row.position}>
                      <td data-label="Milestone">{row.label}</td>
                      <td data-label="Share">{row.percentDisplay}</td>
                      <td data-label="Amount" className={styles.r}>
                        {row.amountDisplay}
                      </td>
                      <td data-label="Due" className={styles.r}>
                        {row.dueText}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <footer className={styles.foot}>
            <span>
              Verification code evidence · Snapshot{" "}
              <span className={styles.mono}>
                {quote.snapshotHash.slice(0, 16)}
              </span>{" "}
              · Calculation{" "}
              <span className={styles.mono}>
                {quote.calculationFingerprint.slice(0, 16)}
              </span>
            </span>
            <Stamp
              variant={stampVariant}
              prefix={`Rev ${quote.revisionNumber}`}
              fingerprint={shortFingerprint(quote.calculationFingerprint)}
            />
          </footer>
        </Paper>
      </div>

      <div
        className={`recipient-actions ${styles.act} ${!canRespond ? styles.actStatic : ""}`}
        role="region"
        aria-label="Respond to this revision"
      >
        <div className={styles.actIn}>
          <h2 className="sr-only">Respond to this revision</h2>
          <div className={styles.sum}>
            <b>{quote.totals.total}</b>
            <small>
              A response is recorded against this exact issued revision.
            </small>
          </div>
          {canRespond ? (
            <div className={styles.actButtons}>
              <button
                className={`${styles.actBtn} ${styles.actPrimary}`}
                type="button"
                onClick={onAccept}
              >
                Accept quotation
              </button>
              <div className={styles.actSecondary}>
                <button
                  className={styles.actBtn}
                  type="button"
                  onClick={onRequestChanges}
                >
                  Request changes
                </button>
                <button
                  className={`${styles.actBtn} ${styles.actDanger}`}
                  type="button"
                  onClick={onDecline}
                >
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <p className={styles.mutedText}>
              No further response can be recorded for this revision.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
