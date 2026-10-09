import type { ChargeType } from "@/lib/quotes/calculate";
import styles from "./charges-section.module.css";
import {
  ChargeRow,
  type ChargeItem,
  type TaxProfileOption,
} from "./charge-row";

type ChargesSectionProps = {
  charges: ChargeItem[];
  taxProfiles: TaxProfileOption[];
  className?: string;
  onAddCharge: () => void;
  onChargeTypeChange: (key: string, value: ChargeType) => void;
  onChargeDescriptionChange: (key: string, value: string) => void;
  onChargeAmountChange: (key: string, value: string) => void;
  onChargeTaxProfileIdChange: (key: string, value: string) => void;
  onChargeDiscountAppliesChange: (key: string, value: boolean) => void;
  onRemoveCharge: (key: string) => void;
};

export function ChargesSection({
  charges,
  taxProfiles,
  className,
  onAddCharge,
  onChargeTypeChange,
  onChargeDescriptionChange,
  onChargeAmountChange,
  onChargeTaxProfileIdChange,
  onChargeDiscountAppliesChange,
  onRemoveCharge,
}: ChargesSectionProps) {
  return (
    <section
      className={`quote-charges ${styles.container} ${className ?? ""}`}
      aria-labelledby="charges-heading"
    >
      <header className={styles.header}>
        <div className={styles.titles}>
          <p className={`eyebrow ${styles.eyebrow}`}>
            Additional commercial amounts
          </p>
          <h2 id="charges-heading" className={styles.heading}>
            Charges
          </h2>
        </div>
        <button
          className={`button ${styles.addChargeButton}`}
          type="button"
          onClick={onAddCharge}
          disabled={!taxProfiles.length}
        >
          Add charge
        </button>
      </header>
      {charges.map((charge, index) => (
        <ChargeRow
          key={charge.key}
          charge={charge}
          index={index}
          taxProfiles={taxProfiles}
          onTypeChange={onChargeTypeChange}
          onDescriptionChange={onChargeDescriptionChange}
          onAmountChange={onChargeAmountChange}
          onTaxProfileIdChange={onChargeTaxProfileIdChange}
          onDiscountAppliesChange={onChargeDiscountAppliesChange}
          onRemove={onRemoveCharge}
        />
      ))}
      {!charges.length && (
        <p className={`quiet-empty ${styles.empty}`}>No additional charges.</p>
      )}
    </section>
  );
}
