import { calculateExtendedLineAmountMinor } from "@/lib/quotes/calculate";
import { formatMinor } from "@/lib/formatting/money";
import styles from "./line-row.module.css";

export type LineRowItem = {
  key: string;
  lineId: string | null;
  product: {
    id: string;
    sku: string;
    description: string;
    unitCode: string;
    unitPriceMinor: number;
    currencyCode: string;
    taxCode: string;
  };
  quantity: string;
};

export type LineCalculationSnapshot = {
  unit_price_minor_snapshot: number;
  quantity_scaled: number;
  quantity_scale: number;
};

type LineRowProps = {
  line: LineRowItem;
  calculated?: LineCalculationSnapshot;
  currencyCode: string;
  locale: string;
  saveState: string;
  refreshingLineId: string | null;
  onQuantityChange: (lineKey: string, quantity: string) => void;
  onRefreshLine: (lineId: string) => void;
  onRemoveLine: (lineKey: string) => void;
};

export function LineRow({
  line,
  calculated,
  currencyCode,
  locale,
  saveState,
  refreshingLineId,
  onQuantityChange,
  onRefreshLine,
  onRemoveLine,
}: LineRowProps) {
  const product = line.product;

  return (
    <tr
      key={line.key}
      data-line-id={line.lineId ?? "new"}
      className={styles.row}
    >
      <td>
        <div className={styles.descWrap}>
          <strong className={styles.sku}>{product.sku}</strong>
          <span className={styles.description}>{product.description}</span>
        </div>
      </td>
      <td>
        <label className={`table-control ${styles.qtyWrap}`}>
          <span className="sr-only">Quantity for {product.sku}</span>
          <input
            className={styles.qtyInput}
            aria-label={`Quantity for ${product.sku}`}
            inputMode="decimal"
            value={line.quantity}
            onChange={(event) => onQuantityChange(line.key, event.target.value)}
          />
          <span className={styles.unitCode}>{product.unitCode}</span>
        </label>
      </td>
      <td className={`money ${styles.numCell}`}>
        {formatMinor(product.unitPriceMinor, product.currencyCode, locale)}
      </td>
      <td className={styles.taxCode}>{product.taxCode}</td>
      <td className={`money ${styles.numCell}`}>
        {calculated
          ? formatMinor(
              calculateExtendedLineAmountMinor({
                unitPriceMinor: calculated.unit_price_minor_snapshot,
                quantityScaled: calculated.quantity_scaled,
                quantityScale: calculated.quantity_scale,
              }),
              currencyCode,
              locale,
            )
          : "—"}
      </td>
      <td>
        <div className={`table-row-actions ${styles.actions}`}>
          {line.lineId && (
            <button
              className={`text-action ${styles.refreshAction}`}
              type="button"
              onClick={() => void onRefreshLine(line.lineId!)}
              disabled={saveState !== "Saved" || refreshingLineId !== null}
            >
              {refreshingLineId === line.lineId
                ? "Refreshing…"
                : "Refresh pricing"}
            </button>
          )}
          <button
            className={`text-action ${styles.removeAction}`}
            type="button"
            aria-label={`Remove ${product.sku}`}
            onClick={() => onRemoveLine(line.key)}
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}
