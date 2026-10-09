import styles from "./line-grid.module.css";
import {
  LineRow,
  type LineCalculationSnapshot,
  type LineRowItem,
} from "./line-row";

export type ProductOption = {
  id: string;
  sku: string;
  description: string;
};

type LineGridProps = {
  lines: LineRowItem[];
  products: ProductOption[];
  selectedProduct: string;
  calculatedItems?: LineCalculationSnapshot[];
  currencyCode: string;
  locale: string;
  saveState: string;
  refreshingLineId: string | null;
  className?: string;
  onSelectedProductChange: (value: string) => void;
  onAddProduct: () => void;
  onQuantityChange: (lineKey: string, quantity: string) => void;
  onRefreshLine: (lineId: string) => void;
  onRemoveLine: (lineKey: string) => void;
};

export function LineGrid({
  lines,
  products,
  selectedProduct,
  calculatedItems,
  currencyCode,
  locale,
  saveState,
  refreshingLineId,
  className,
  onSelectedProductChange,
  onAddProduct,
  onQuantityChange,
  onRefreshLine,
  onRemoveLine,
}: LineGridProps) {
  return (
    <section
      className={`quote-lines ${styles.container} ${className ?? ""}`}
      aria-labelledby="lines-heading"
    >
      <header className={styles.header}>
        <div className={styles.titles}>
          <p className={`eyebrow ${styles.eyebrow}`}>Commercial lines</p>
          <h2 id="lines-heading" className={styles.heading}>
            Items
          </h2>
        </div>
        <div className={`inline-add ${styles.inlineAdd}`}>
          <label className={styles.inlineAddLabel}>
            Catalog product
            <select
              aria-label="Catalog product"
              className={styles.selectProduct}
              value={selectedProduct}
              onChange={(event) => onSelectedProductChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddProduct();
                }
              }}
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.sku} — {product.description}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`button ${styles.addProductButton}`}
            type="button"
            onClick={onAddProduct}
            disabled={!selectedProduct}
          >
            Add product
          </button>
        </div>
      </header>
      <div
        className={`table-region ${styles.tableRegion}`}
        tabIndex={0}
        role="region"
        aria-label="Quotation items table"
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Item</th>
              <th className={styles.numCol}>Quantity</th>
              <th className={styles.numCol}>Unit price</th>
              <th>Tax</th>
              <th className={styles.numCol}>Amount</th>
              <th>
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const calculated = calculatedItems?.[index];
              return (
                <LineRow
                  key={line.key}
                  line={line}
                  calculated={calculated}
                  currencyCode={currencyCode}
                  locale={locale}
                  saveState={saveState}
                  refreshingLineId={refreshingLineId}
                  onQuantityChange={onQuantityChange}
                  onRefreshLine={onRefreshLine}
                  onRemoveLine={onRemoveLine}
                />
              );
            })}
            {!lines.length && (
              <tr>
                <td colSpan={6} className={`table-empty ${styles.tableEmpty}`}>
                  Add a catalog product to prepare this quotation.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
