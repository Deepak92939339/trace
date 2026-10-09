import { formatMinor } from "@/lib/formatting/money";
import type { PaymentScheduleRow } from "@/lib/quotes/payment-schedule";
import { noteLines, printMeasures } from "@/lib/quotes/print-measures";
import { paginatePrintDocument } from "@/lib/quotes/print-pagination";

export function chunkPrintItems<T>(items: T[], size = 14) {
  if (size < 1) throw new RangeError("Print chunk size must be positive.");
  if (items.length === 0) return [[]] as T[][];
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );
}

type PrintItem = {
  id: string;
  position: number;
  sku: string;
  description: string;
  unitCode: string;
  quantityScaled: number;
  quantityScale: number;
  unitPriceMinor: number;
  taxCode: string;
  extendedAmountMinor: number;
};
type PrintCharge = {
  id: string;
  description: string;
  amountMinor: number;
  taxMinor: number;
  totalMinor: number;
};
type SellerSnapshot = {
  legalName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  taxIdentifier: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

function quantity(scaled: number, scale: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.round(Math.log10(scale)),
  }).format(scaled / scale);
}

export function IssuedPrintDocument({
  quote,
  seller,
  customer,
  items,
  charges,
  paymentSchedule,
  issuedActor,
}: {
  quote: {
    number: string;
    issueDate: string;
    validUntil: string;
    currencyCode: string;
    locale: string;
    taxLabel: string;
    taxMode: "exclusive" | "inclusive";
    notes: string;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    chargesMinor: number;
    chargeNetMinor: number;
    totalMinor: number;
    issuedAt: string;
    /** IANA zone the issue time is shown in. Omitted: the runtime's own zone. */
    timeZone?: string;
    /** Shown on continued pages beside the number. Omitted for pre-revision quotes. */
    revisionNumber?: number;
  };
  seller: SellerSnapshot | null;
  customer: {
    name: string;
    contactName: string;
    email: string;
    address: string;
    taxIdentifier: string | null;
  };
  items: PrintItem[];
  charges: PrintCharge[];
  /** Sealed schedule of when payment is due (empty for v1). Rendered by B10c. */
  paymentSchedule?: PaymentScheduleRow[];
  issuedActor: string;
}) {
  // Pages are sized by a unit-height model (lib/quotes/print-pagination.ts), not by item count:
  // every .print-page fits one A4 sheet, so "Page X of N" is the physical page.
  const measures = printMeasures({
    items,
    charges,
    schedule: paymentSchedule ?? [],
    notes: quote.notes,
    seller,
    customer,
  });
  const plan = paginatePrintDocument(measures);
  const noteSegments = noteLines(quote.notes);
  const notesSlice = ([from, to]: readonly [number, number]) =>
    quote.notes.slice(noteSegments[from]!.start, noteSegments[to - 1]!.end);
  const schedule = paymentSchedule ?? [];
  const money = (minor: number) =>
    formatMinor(minor, quote.currencyCode, quote.locale);
  return (
    <section
      className="print-document"
      aria-label={`Print presentation for ${quote.number}`}
    >
      {plan.map((page, pageIndex) => {
        const finalPage = pageIndex === plan.length - 1;
        const pageItems = items.slice(page.items[0], page.items[1]);
        const hasItems = pageItems.length > 0;
        const hasCharges = page.charges[1] > page.charges[0];
        const hasSchedule = page.schedule[1] > page.schedule[0];
        const hasNotes = page.notes[1] > page.notes[0];
        const hasFinal =
          hasCharges ||
          page.totals ||
          hasSchedule ||
          page.taxNote ||
          hasNotes ||
          page.issuedBy;
        return (
          <article className="print-page" key={pageIndex}>
            {pageIndex === 0 ? (
              <>
                <header className="print-header">
                  <div>
                    <strong className="print-document-title">
                      Commercial quotation
                    </strong>
                    <p>
                      Prepared in <span className="brand-word">Trace</span>
                    </p>
                  </div>
                  <div className="print-meta">
                    <strong>{quote.number}</strong>
                    <span>Issued</span>
                    <small>Issue date · {quote.issueDate}</small>
                    <small>Valid until · {quote.validUntil}</small>
                  </div>
                </header>
                <section
                  className="print-parties"
                  aria-label="Commercial parties"
                >
                  <div className="print-party print-seller" aria-label="Seller">
                    <span>Seller</span>
                    {seller ? (
                      <>
                        <strong>{seller.legalName}</strong>
                        <address>
                          <small>{seller.addressLine1}</small>
                          {seller.addressLine2 && (
                            <small>{seller.addressLine2}</small>
                          )}
                          <small>
                            {[seller.city, seller.region, seller.postalCode]
                              .filter(Boolean)
                              .join(", ")}
                          </small>
                          <small>{seller.countryCode}</small>
                        </address>
                        {seller.taxIdentifier && (
                          <small>Tax ID: {seller.taxIdentifier}</small>
                        )}
                        {(seller.contactEmail || seller.contactPhone) && (
                          <small>
                            {[seller.contactEmail, seller.contactPhone]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        )}
                      </>
                    ) : (
                      <p className="print-snapshot-missing">
                        Seller identity was not captured when this pre-R local
                        quotation was issued.
                      </p>
                    )}
                  </div>
                  <div
                    className="print-party print-customer"
                    aria-label="Customer"
                  >
                    <span>Customer</span>
                    <strong>{customer.name}</strong>
                    <small>
                      {[customer.contactName, customer.email]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                    <small>{customer.address}</small>
                    {customer.taxIdentifier && (
                      <small>Tax ID: {customer.taxIdentifier}</small>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <>
                <header className="print-header-compact">
                  <strong>
                    {quote.number}
                    {quote.revisionNumber !== undefined &&
                      ` · Revision ${quote.revisionNumber}`}
                  </strong>
                  <span>Commercial quotation · Continued</span>
                </header>
                <p className="continued-label">
                  {hasItems
                    ? "Continued — commercial lines"
                    : page.totals
                      ? "Continued — totals and terms"
                      : "Continued — terms and notes"}
                </p>
              </>
            )}
            {(pageIndex === 0 || hasItems) && (
              <table className="print-lines">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Unit price</th>
                    <th>Tax</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.sku}</strong>
                        <span>{item.description}</span>
                      </td>
                      <td>
                        {quantity(
                          item.quantityScaled,
                          item.quantityScale,
                          quote.locale,
                        )}{" "}
                        {item.unitCode}
                      </td>
                      <td>{money(item.unitPriceMinor)}</td>
                      <td>{item.taxCode}</td>
                      <td>{money(item.extendedAmountMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {hasFinal && (
              <div className="print-final">
                {hasCharges && (
                  <section>
                    <h2>
                      Charges (incl. tax)
                      {page.charges[0] > 0 ? ", continued" : ""}
                    </h2>
                    {charges
                      .slice(page.charges[0], page.charges[1])
                      .map((charge) => (
                        <div className="print-charge" key={charge.id}>
                          <span>{charge.description}</span>
                          <strong>{money(charge.totalMinor)}</strong>
                        </div>
                      ))}
                  </section>
                )}
                {page.totals && (
                  <dl className="print-totals">
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{money(quote.subtotalMinor)}</dd>
                    </div>
                    <div>
                      <dt>Discount</dt>
                      <dd>− {money(quote.discountMinor)}</dd>
                    </div>
                    <div>
                      <dt>{quote.taxLabel}</dt>
                      <dd>{money(quote.taxMinor)}</dd>
                    </div>
                    <div>
                      <dt>Charges</dt>
                      <dd>{money(quote.chargeNetMinor)}</dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>{money(quote.totalMinor)}</dd>
                    </div>
                  </dl>
                )}
                {hasSchedule && (
                  <section
                    className="print-payment-schedule"
                    aria-label="Payment schedule"
                    style={{ gridColumn: "1 / -1", marginTop: "4mm" }}
                  >
                    <h2 style={{ margin: "0 0 2mm", fontSize: "10pt" }}>
                      Payment schedule
                      {page.schedule[0] > 0 ? " (continued)" : ""}
                    </h2>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontSize: "8.5pt",
                        tableLayout: "fixed",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            borderBottom: "1px solid #17212b",
                            textTransform: "uppercase",
                            fontSize: "7.5pt",
                            letterSpacing: "0.06em",
                            color: "#4b5563",
                          }}
                        >
                          <th style={{ textAlign: "left", padding: "1.5mm 0" }}>
                            Milestone
                          </th>
                          <th style={{ textAlign: "left", padding: "1.5mm 0" }}>
                            Share
                          </th>
                          <th
                            style={{ textAlign: "right", padding: "1.5mm 0" }}
                          >
                            Amount
                          </th>
                          <th
                            style={{ textAlign: "right", padding: "1.5mm 0" }}
                          >
                            Due
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule
                          .slice(page.schedule[0], page.schedule[1])
                          .map((row) => (
                            <tr
                              key={row.position}
                              style={{ borderBottom: "1px solid #e5e7eb" }}
                            >
                              <td style={{ padding: "2mm 0" }}>{row.label}</td>
                              <td style={{ padding: "2mm 0" }}>
                                {row.percentDisplay}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "2mm 0",
                                }}
                              >
                                {row.amountDisplay}
                              </td>
                              <td
                                style={{
                                  textAlign: "right",
                                  padding: "2mm 0",
                                }}
                              >
                                {row.dueText}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </section>
                )}
                {page.taxNote && (
                  <p className="print-issuance">
                    Prices are tax-{quote.taxMode}. The quotation tax mode is
                    authoritative for all item and charge amounts.
                  </p>
                )}
                {hasNotes && (
                  <section className="print-notes">
                    <h2>
                      Commercial notes
                      {page.notes[0] > 0 ? " (continued)" : ""}
                    </h2>
                    <p>{notesSlice(page.notes)}</p>
                  </section>
                )}
                {page.issuedBy && (
                  <p className="print-issuance">
                    Issued by {issuedActor} on{" "}
                    {new Intl.DateTimeFormat(quote.locale, {
                      dateStyle: "long",
                      timeStyle: "short",
                      timeZone: quote.timeZone,
                    }).format(new Date(quote.issuedAt))}
                    . Issuance does not mean delivery.
                  </p>
                )}
              </div>
            )}
            <footer>
              <span>{finalPage ? "Final page" : "Continued"}</span>
              <span>
                Page {pageIndex + 1} of {plan.length}
              </span>
            </footer>
          </article>
        );
      })}
    </section>
  );
}
