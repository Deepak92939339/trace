import type { IssuedPrintProps } from "../quotes/issued-print-props";
import { formatMinor } from "../formatting/money.ts";
import type { TokenValues } from "./tokens.ts";
/** Presentation strings only. No commercial arithmetic, live-table fields, costs or approvals. */
export function printDataFromIssued(props: IssuedPrintProps) {
  const q = props.quote,
    s = props.seller;
  const money = (value: number) => formatMinor(value, q.currencyCode, q.locale);
  const totals = {
    subtotal: money(q.subtotalMinor),
    discount: money(q.discountMinor),
    tax: money(q.taxMinor),
    charges: money(q.chargeNetMinor),
    grand: money(q.totalMinor),
  };
  const seller = {
    name: s?.legalName ?? "Seller identity not captured",
    address: s
      ? [
          s.addressLine1,
          s.addressLine2,
          s.city,
          s.region,
          s.postalCode,
          s.countryCode,
        ]
          .filter(Boolean)
          .join(", ")
      : "",
    taxId: s?.taxIdentifier ?? "",
    contact: [s?.contactEmail, s?.contactPhone].filter(Boolean).join(" · "),
  };
  const quote = {
    number: q.number,
    revision: q.revisionNumber === undefined ? "" : `Rev ${q.revisionNumber}`,
    date: q.issueDate,
    validUntil: q.validUntil,
    currency: q.currencyCode,
    title: "Commercial quotation",
    taxLabel: q.taxLabel,
    taxMode: q.taxMode,
    notes: q.notes,
  };
  const tokens: TokenValues = {
    "seller.name": seller.name,
    "seller.tax_id": seller.taxId,
    "customer.name": props.customer.name,
    "customer.contact": props.customer.contactName,
    "quote.number": quote.number,
    "quote.rev": quote.revision,
    "quote.date": quote.date,
    "quote.valid_until": quote.validUntil,
    "quote.title": quote.title,
    "totals.grand": totals.grand,
    "totals.subtotal": totals.subtotal,
    "totals.tax": totals.tax,
  };
  return {
    quote,
    seller,
    customer: {
      name: props.customer.name,
      contact: props.customer.contactName,
      email: props.customer.email,
      address: props.customer.address,
      taxId: props.customer.taxIdentifier ?? "",
    },
    totals,
    tokens,
    items: props.items.map((i) => ({
      id: i.id,
      sku: i.sku,
      description: i.description,
      spec: "",
      qty: new Intl.NumberFormat(q.locale, {
        maximumFractionDigits: Math.round(Math.log10(i.quantityScale)),
      }).format(i.quantityScaled / i.quantityScale),
      unit: i.unitCode,
      rate: money(i.unitPriceMinor),
      tax_code: i.taxCode,
      amount: money(i.extendedAmountMinor),
    })),
    charges: props.charges.map((c) => ({
      id: c.id,
      description: c.description,
      amount: money(c.amountMinor),
      tax: money(c.taxMinor),
      total: money(c.totalMinor),
    })),
    paymentSchedule: (props.paymentSchedule ?? []).map((p) => ({
      label: p.label,
      share: p.percentDisplay,
      amount: p.amountDisplay,
      when: p.dueText,
      date: p.dueDate ?? "",
    })),
  };
}
export type PrintData = ReturnType<typeof printDataFromIssued>;
