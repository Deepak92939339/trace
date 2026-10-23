"use client";

import { useState } from "react";
import { Paper } from "@/components/paper/paper";
import { DoubleRule } from "@/components/paper/double-rule";
import { Stamp } from "@/components/paper/stamp";
import { Money } from "@/components/ui/money";
import { SAMPLE_QUOTE_INITIAL_STATE } from "@/components/demo/sample-quote-builder";
import {
  calculateSampleQuote,
  marketFor,
} from "@/lib/demo/sample-quote-adapter";
import styles from "./product-stage.module.css";

export function ProductStage() {
  const [quantity, setQuantity] = useState(
    SAMPLE_QUOTE_INITIAL_STATE.items[0]?.quantity ?? "1",
  );
  const [discount, setDiscount] = useState(SAMPLE_QUOTE_INITIAL_STATE.discount);
  const state = {
    ...SAMPLE_QUOTE_INITIAL_STATE,
    discount,
    items: SAMPLE_QUOTE_INITIAL_STATE.items.map((item, index) =>
      index === 0 ? { ...item, quantity } : item,
    ),
  };
  const market = marketFor(state.marketId);
  let quote: ReturnType<typeof calculateSampleQuote> | null = null;
  let error: string | null = null;
  try {
    quote = calculateSampleQuote(state);
  } catch {
    error =
      "Enter a supported quantity and discount to calculate this specimen.";
  }
  const money = (minor: number, showCurrency = false) => (
    <Money
      minor={minor}
      currency={market.currency}
      locale={market.locale}
      showCurrency={showCurrency}
    />
  );

  return (
    <div className={styles.stage} aria-label="Product preview">
      <div className={styles.bench}>
        <div className={styles.benchTop}>
          <span className={styles.dots} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={styles.mono}>Quotation specimen</span>
          <span className={styles.live}>Interactive</span>
        </div>
        <div className={styles.controls}>
          <label>
            First line qty
            <input
              aria-label="First line qty (hero specimen)"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "hero-calculation-error" : undefined}
            />
          </label>
          <label>
            Discount %
            <input
              aria-label="Discount % (hero specimen)"
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "hero-calculation-error" : undefined}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setQuantity(SAMPLE_QUOTE_INITIAL_STATE.items[0]?.quantity ?? "1");
              setDiscount(SAMPLE_QUOTE_INITIAL_STATE.discount);
            }}
          >
            Reset
          </button>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Description</th>
                <th className={styles.r}>Qty</th>
                <th className={styles.r}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item, index) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td className={styles.r}>{item.quantity}</td>
                  <td className={styles.r}>
                    {quote?.items[index]
                      ? money(quote.items[index].extended_line_amount_minor)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.demoNote}>Demo only · not issued or stored</p>
      </div>
      <Paper
        as="article"
        className={styles.record}
        aria-label="Live hero quotation specimen"
      >
        <div className={styles.stampSpot}>
          <Stamp variant="draft" prefix="Demo" />
        </div>
        <div className={styles.docHead}>
          <span className={styles.sellerName}>Quotation specimen</span>
          <span className={styles.docMeta}>{market.currency}</span>
        </div>
        <DoubleRule className={styles.rule} />
        <h3 className={styles.docTitle}>Prepared for {state.customerName}</h3>
        {quote ? (
          <>
            <dl className={styles.totalsRows}>
              <div>
                <dt>Subtotal</dt>
                <dd>{money(quote.subtotal_minor)}</dd>
              </div>
              <div>
                <dt>Discount</dt>
                <dd>{money(-quote.discount_minor)}</dd>
              </div>
              <div>
                <dt>Tax</dt>
                <dd>{money(quote.tax_minor)}</dd>
              </div>
            </dl>
            <div className={styles.grandTotal}>
              <span>Total</span>
              <span data-testid="hero-total">
                {money(quote.total_minor, true)}
              </span>
            </div>
          </>
        ) : (
          <p className={styles.error} id="hero-calculation-error" role="alert">
            {error}
          </p>
        )}
        <p className={styles.recordNote}>
          Calculated with Trace’s shared money kernel. This specimen cannot be
          issued.
        </p>
        <a className={styles.openBuilder} href="#sample-builder">
          Open the full specimen →
        </a>
      </Paper>
      <span className="sr-only" aria-live="polite">
        {quote ? <>Specimen total: {money(quote.total_minor, true)}</> : null}
      </span>
    </div>
  );
}
