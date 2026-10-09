import { SUPPORTED_CURRENCY_CODES } from "@/lib/formatting/currency";
import type { TaxPriceBasis } from "@/lib/quotes/calculate";
import styles from "./terms-strip.module.css";

type CustomerOption = {
  id: string;
  name: string;
};

type TermsStripProps = {
  customerId: string;
  customers: CustomerOption[];
  issueDate: string;
  validUntil: string;
  currencyCode: string;
  locale: string;
  taxLabel: string;
  taxMode: TaxPriceBasis;
  discountBps: number;
  className?: string;
  onCustomerIdChange: (value: string) => void;
  onIssueDateChange: (value: string) => void;
  onValidUntilChange: (value: string) => void;
  onCurrencyCodeChange: (value: string) => void;
  onLocaleChange: (value: string) => void;
  onTaxLabelChange: (value: string) => void;
  onTaxModeChange: (value: TaxPriceBasis) => void;
  onDiscountBpsChange: (value: string) => void;
};

export function TermsStrip({
  customerId,
  customers,
  issueDate,
  validUntil,
  currencyCode,
  locale,
  taxLabel,
  taxMode,
  discountBps,
  className,
  onCustomerIdChange,
  onIssueDateChange,
  onValidUntilChange,
  onCurrencyCodeChange,
  onLocaleChange,
  onTaxLabelChange,
  onTaxModeChange,
  onDiscountBpsChange,
}: TermsStripProps) {
  return (
    <div
      className={`quote-header-fields ${styles.container} ${className ?? ""}`}
    >
      <div className={styles.grid}>
        <label className={`${styles.field} ${styles.fieldCustomer}`}>
          Customer
          <select
            className={styles.control}
            value={customerId}
            onChange={(event) => onCustomerIdChange(event.target.value)}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Currency
          <select
            aria-label="Quote currency"
            className={styles.control}
            value={currencyCode}
            onChange={(event) => onCurrencyCodeChange(event.target.value)}
          >
            {SUPPORTED_CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Locale
          <input
            className={styles.control}
            value={locale}
            maxLength={35}
            onChange={(event) => onLocaleChange(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Price basis
          <select
            className={styles.control}
            value={taxMode}
            onChange={(event) =>
              onTaxModeChange(event.target.value as TaxPriceBasis)
            }
          >
            <option value="exclusive">Tax exclusive</option>
            <option value="inclusive">Tax inclusive</option>
          </select>
        </label>
        <label className={styles.field}>
          Tax label
          <input
            className={styles.control}
            value={taxLabel}
            maxLength={80}
            onChange={(event) => onTaxLabelChange(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Discount %
          <input
            aria-label="Discount percent"
            className={styles.control}
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={discountBps / 100}
            onChange={(event) => onDiscountBpsChange(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Issue date
          <input
            className={styles.control}
            type="date"
            value={issueDate}
            onChange={(event) => onIssueDateChange(event.target.value)}
          />
        </label>
        <label className={styles.field}>
          Valid until
          <input
            className={styles.control}
            type="date"
            value={validUntil}
            onChange={(event) => onValidUntilChange(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
