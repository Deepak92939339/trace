import { formatMinor } from "@/lib/formatting/money";
import type { TaxPriceBasis } from "@/lib/quotes/calculate";
import {
  MathPopover,
  type MathLine,
  type MathAdjustment,
} from "@/components/paper/math-popover";
import { presentTotals } from "@/lib/quotes/presentation-totals";
import styles from "./totals-list.module.css";

export type DisplayTotals = {
  subtotal_minor: number;
  discount_minor: number;
  tax_minor: number;
  charges_minor: number;
  charge_net_minor?: number;
  total_minor: number;
};

type TotalsListProps = {
  preparedError?: string | null;
  displayTotals: DisplayTotals;
  currencyCode: string;
  locale: string;
  taxMode: TaxPriceBasis;
  customerTreatment: string;
  mathLines?: MathLine[];
  mathAdjustments?: MathAdjustment[];
};

export function TotalsList({
  preparedError,
  displayTotals,
  currencyCode,
  locale,
  taxMode,
  customerTreatment,
  mathLines,
  mathAdjustments,
}: TotalsListProps) {
  const presented = presentTotals({
    subtotalMinor: displayTotals.subtotal_minor,
    discountMinor: displayTotals.discount_minor,
    taxMinor: displayTotals.tax_minor,
    totalMinor: displayTotals.total_minor,
    chargeNetMinor: displayTotals.charge_net_minor,
  });
  return (
    <>
      <p className={`eyebrow ${styles.eyebrow}`}>Calculation summary</p>
      <h2 className={styles.heading}>Exact totals</h2>
      {preparedError && (
        <div className={`form-error ${styles.formError}`} role="alert">
          {preparedError}
        </div>
      )}
      <dl className={styles.list}>
        <div className={styles.row}>
          <dt className={styles.dt}>Subtotal</dt>
          <dd className={styles.dd}>
            {formatMinor(displayTotals.subtotal_minor, currencyCode, locale)}
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.dt}>Discount</dt>
          <dd className={styles.dd}>
            − {formatMinor(displayTotals.discount_minor, currencyCode, locale)}
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.dt}>Tax</dt>
          <dd className={styles.dd}>
            {formatMinor(displayTotals.tax_minor, currencyCode, locale)}
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.dt}>Charges</dt>
          <dd className={styles.dd}>
            {formatMinor(presented.chargesNetMinor, currencyCode, locale)}
          </dd>
        </div>
        <div className={`total-row ${styles.totalRow}`}>
          <dt className={styles.totalDt}>
            <span>Total</span>
            {mathLines && mathLines.length > 0 && (
              <MathPopover
                currency={currencyCode}
                locale={locale}
                lines={mathLines}
                adjustments={mathAdjustments ?? []}
                totalMinor={displayTotals.total_minor}
                align="start"
              />
            )}
          </dt>
          <dd className={styles.totalDd}>
            {formatMinor(displayTotals.total_minor, currencyCode, locale)}
          </dd>
        </div>
      </dl>
      <p className={`legal-note ${styles.legalNote}`}>
        {taxMode === "inclusive"
          ? "Prices are marked tax-inclusive."
          : "Prices are marked tax-exclusive."}{" "}
        {customerTreatment.replaceAll("_", " ")} treatment.
      </p>
    </>
  );
}
