import type { ChargeType } from "@/lib/quotes/calculate";
import styles from "./charge-row.module.css";

export type ChargeItem = {
  key: string;
  chargeId: string | null;
  chargeType: ChargeType;
  description: string;
  amount: string;
  taxProfileId: string;
  taxCode: string;
  taxBps: number;
  discountApplies: boolean;
};

export type TaxProfileOption = {
  id: string;
  code: string;
  label: string;
};

type ChargeRowProps = {
  charge: ChargeItem;
  index: number;
  taxProfiles: TaxProfileOption[];
  onTypeChange: (key: string, value: ChargeType) => void;
  onDescriptionChange: (key: string, value: string) => void;
  onAmountChange: (key: string, value: string) => void;
  onTaxProfileIdChange: (key: string, value: string) => void;
  onDiscountAppliesChange: (key: string, value: boolean) => void;
  onRemove: (key: string) => void;
};

export function ChargeRow({
  charge,
  index,
  taxProfiles,
  onTypeChange,
  onDescriptionChange,
  onAmountChange,
  onTaxProfileIdChange,
  onDiscountAppliesChange,
  onRemove,
}: ChargeRowProps) {
  return (
    <div
      className={`charge-row ${styles.row}`}
      key={charge.key}
      data-charge-id={charge.chargeId ?? "new"}
    >
      <label className={`${styles.field} ${styles.fieldType}`}>
        Type
        <select
          aria-label={`Charge ${index + 1} type`}
          className={styles.control}
          value={charge.chargeType}
          onChange={(event) =>
            onTypeChange(charge.key, event.target.value as ChargeType)
          }
        >
          {[
            "freight",
            "shipping",
            "handling",
            "insurance",
            "packaging",
            "customs_duties",
            "other",
          ].map((type) => (
            <option key={type} value={type}>
              {type.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <label
        className={`charge-description ${styles.field} ${styles.fieldDesc}`}
      >
        Description
        <input
          aria-label={`Charge ${index + 1} description`}
          className={styles.control}
          value={charge.description}
          maxLength={300}
          onChange={(event) =>
            onDescriptionChange(charge.key, event.target.value)
          }
        />
      </label>
      <label className={`${styles.field} ${styles.fieldAmount}`}>
        Amount
        <input
          aria-label={`Charge ${index + 1} amount`}
          className={`${styles.control} ${styles.numInput}`}
          inputMode="decimal"
          value={charge.amount}
          onChange={(event) => onAmountChange(charge.key, event.target.value)}
        />
      </label>
      {charge.chargeId ? (
        <label className={`${styles.field} ${styles.fieldTax}`}>
          Tax snapshot
          <input
            aria-label={`Charge ${index + 1} tax snapshot`}
            className={styles.control}
            value={`${charge.taxCode} · ${(charge.taxBps / 100).toFixed(2)}%`}
            readOnly
          />
        </label>
      ) : (
        <label className={`${styles.field} ${styles.fieldTax}`}>
          Tax profile
          <select
            aria-label={`Charge ${index + 1} tax profile`}
            className={styles.control}
            value={charge.taxProfileId}
            onChange={(event) =>
              onTaxProfileIdChange(charge.key, event.target.value)
            }
          >
            {taxProfiles.map((tax) => (
              <option key={tax.id} value={tax.id}>
                {tax.code} — {tax.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={`checkbox ${styles.checkboxField}`}>
        <input
          type="checkbox"
          checked={charge.discountApplies}
          onChange={(event) =>
            onDiscountAppliesChange(charge.key, event.target.checked)
          }
        />{" "}
        Apply quote discount
      </label>
      <button
        className={`text-action ${styles.removeButton}`}
        type="button"
        onClick={() => onRemove(charge.key)}
      >
        Remove charge
      </button>
    </div>
  );
}
