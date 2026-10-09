import { Paper } from "@/components/paper/paper";
import { Letterhead } from "@/components/paper/letterhead";
import { formatMinor } from "@/lib/formatting/money";
import { presentTotals } from "@/lib/quotes/presentation-totals";
import type { DisplayTotals } from "./totals-list";
import type { TaxPriceBasis } from "@/lib/quotes/calculate";
import styles from "./document-preview.module.css";

export type DocumentPreviewLine = {
  key: string;
  sku: string;
  description: string;
  quantity: string;
  unitCode: string;
  unitPriceMinor: number;
  amountMinor?: number;
};

export type DocumentPreviewCharge = {
  key: string;
  description: string;
  amountMinor: number;
};

export type DocumentPreviewMilestone = {
  label: string;
  percentDisplay: string;
  amountDisplay: string;
  dueText: string;
};

export type DocumentPreviewProps = {
  quoteNumber: string;
  issueDate: string;
  validUntil: string;
  customerName?: string;
  customerContact?: string | null;
  customerAddress?: string | null;
  lines: DocumentPreviewLine[];
  charges?: DocumentPreviewCharge[];
  displayTotals: DisplayTotals;
  currencyCode: string;
  locale: string;
  taxMode: TaxPriceBasis;
  taxLabel: string;
  /** Seller identity: the issued snapshot if one exists, otherwise the organization. */
  sellerName: string;
  sellerAddressLines: string[];
  paymentSchedule?: DocumentPreviewMilestone[];
};

export function DocumentPreview({
  quoteNumber,
  issueDate,
  validUntil,
  customerName,
  customerContact,
  customerAddress,
  lines,
  charges = [],
  displayTotals,
  currencyCode,
  locale,
  taxMode,
  taxLabel,
  sellerName,
  sellerAddressLines,
  paymentSchedule,
}: DocumentPreviewProps) {
  const metaLines = [
    validUntil ? `Valid until ${validUntil}` : null,
    issueDate ? `Issue date ${issueDate}` : null,
  ].filter(Boolean);

  return (
    <aside className={styles.preview} aria-label="Live document preview">
      <div className={styles.previewLabel}>
        <span className={styles.live}>Live preview — not issued</span>
      </div>

      <Paper as="article" padding="lg" className={styles.paperDoc}>
        <Letterhead
          sellerName={sellerName}
          documentType="Quotation"
          documentNumber={quoteNumber}
          metaLines={metaLines}
          addressLines={sellerAddressLines}
        />

        <div className={styles.parties}>
          <div>
            <span className={styles.eyebrow}>From</span>
            <b className={styles.partyName}>{sellerName}</b>
            {sellerAddressLines.length > 0 && (
              <span className={styles.partyDetail}>
                {sellerAddressLines.join(" · ")}
              </span>
            )}
          </div>
          <div>
            <span className={styles.eyebrow}>For</span>
            <b className={styles.partyName}>{customerName || "Customer"}</b>
            <span className={styles.partyDetail}>
              {customerContact
                ? `Attn. ${customerContact}`
                : customerAddress || ""}
            </span>
          </div>
        </div>

        <table className={styles.linesTable}>
          <thead>
            <tr>
              <th>Description</th>
              <th className={styles.numRight}>Qty</th>
              <th className={styles.numRight}>Unit price</th>
              <th className={styles.numRight}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} className={styles.emptyLines}>
                  No items added to quotation.
                </td>
              </tr>
            ) : (
              lines.map((item) => (
                <tr key={item.key}>
                  <td>
                    <div className={styles.itemDesc}>
                      {item.sku
                        ? `${item.description} · ${item.sku}`
                        : item.description}
                    </div>
                  </td>
                  <td className={styles.numRight}>
                    {item.quantity} {item.unitCode}
                  </td>
                  <td className={styles.numRight}>
                    {formatMinor(item.unitPriceMinor, currencyCode, locale)}
                  </td>
                  <td className={styles.numRight}>
                    {item.amountMinor !== undefined
                      ? formatMinor(item.amountMinor, currencyCode, locale)
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {charges.length > 0 && (
          <div className={styles.chargesSection}>
            <div className={styles.chargesTitle}>Charges (incl. tax)</div>
            {charges.map((charge) => (
              <div key={charge.key} className={styles.chargeItem}>
                <span>{charge.description}</span>
                <span className={styles.numRight}>
                  {formatMinor(charge.amountMinor, currencyCode, locale)}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.previewTotals}>
          <div className={styles.previewSummaryRow}>
            <span className={styles.summaryLabel}>Subtotal</span>
            <span className={styles.summaryValue}>
              {formatMinor(displayTotals.subtotal_minor, currencyCode, locale)}
            </span>
          </div>
          {displayTotals.discount_minor > 0 && (
            <div className={styles.previewSummaryRow}>
              <span className={styles.summaryLabel}>Discount</span>
              <span className={styles.summaryValue}>
                −{" "}
                {formatMinor(
                  displayTotals.discount_minor,
                  currencyCode,
                  locale,
                )}
              </span>
            </div>
          )}
          <div className={styles.previewSummaryRow}>
            <span className={styles.summaryLabel}>{taxLabel}</span>
            <span className={styles.summaryValue}>
              {formatMinor(displayTotals.tax_minor, currencyCode, locale)}
            </span>
          </div>
          {presentTotals({
            subtotalMinor: displayTotals.subtotal_minor,
            discountMinor: displayTotals.discount_minor,
            taxMinor: displayTotals.tax_minor,
            totalMinor: displayTotals.total_minor,
            chargeNetMinor: displayTotals.charge_net_minor,
          }).chargesNetMinor > 0 && (
            <div className={styles.previewSummaryRow}>
              <span className={styles.summaryLabel}>Charges</span>
              <span className={styles.summaryValue}>
                {formatMinor(
                  presentTotals({
                    subtotalMinor: displayTotals.subtotal_minor,
                    discountMinor: displayTotals.discount_minor,
                    taxMinor: displayTotals.tax_minor,
                    totalMinor: displayTotals.total_minor,
                    chargeNetMinor: displayTotals.charge_net_minor,
                  }).chargesNetMinor,
                  currencyCode,
                  locale,
                )}
              </span>
            </div>
          )}
          <div className={styles.previewGrandRow}>
            <span className={styles.grandLabel}>Total</span>
            <span className={styles.grandValue}>
              {formatMinor(displayTotals.total_minor, currencyCode, locale)}
            </span>
          </div>
        </div>

        {paymentSchedule && paymentSchedule.length > 0 && (
          <div className={styles.previewSchedule} aria-label="Payment schedule">
            <div className={styles.scheduleTitle}>Payment schedule</div>
            <table className={styles.scheduleTable}>
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Share</th>
                  <th className={styles.numRight}>Amount</th>
                  <th className={styles.numRight}>Due</th>
                </tr>
              </thead>
              <tbody>
                {paymentSchedule.map((row, idx) => (
                  <tr key={idx}>
                    <td>{row.label}</td>
                    <td>{row.percentDisplay}</td>
                    <td className={styles.numRight}>{row.amountDisplay}</td>
                    <td className={styles.numRight}>{row.dueText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.docFoot}>
          <span>Draft preview — not issued</span>
          <span className={styles.mono}>
            {currencyCode} · tax {taxMode}
          </span>
        </div>
      </Paper>
    </aside>
  );
}
