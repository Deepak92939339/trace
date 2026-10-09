import { createHash } from "node:crypto";
import type { ComponentProps } from "react";
import type { IssuedPrintDocument } from "@/components/quotes/issued-print-document";
import { formatMinor } from "@/lib/formatting/money";
import { calculateExtendedLineAmountMinor } from "@/lib/quotes/calculate";
import {
  canonicalizeQuoteSnapshot,
  canonicalUtf8,
  type CanonicalQuoteSnapshot,
} from "@/lib/quotes/canonical-snapshot";
import {
  presentPaymentSchedule,
  type PaymentScheduleEntryV2,
} from "@/lib/quotes/payment-schedule";

/**
 * The single source of props for the issued quotation print document, used by the quote page
 * (browser print) and by the PDF renderer. Everything comes from the sealed revision snapshot,
 * so a revision prints its own content even after a successor revision has rewritten the live
 * quote tables. The adapter only ever sees snapshot fields, an issue timestamp and an actor
 * name: internal commercial inputs and approval details are not reachable from here.
 */
export type IssuedPrintProps = ComponentProps<typeof IssuedPrintDocument>;

export class SealedSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SealedSnapshotError";
  }
}

/**
 * Returns the snapshot only when it is well formed and hashes to the revision's recorded
 * snapshot_hash. Anything else is an integrity failure, never silently printed.
 */
export function verifiedSealedSnapshot(revision: {
  snapshot: unknown;
  snapshot_hash: string | null;
}): CanonicalQuoteSnapshot {
  if (!revision.snapshot || !revision.snapshot_hash)
    throw new SealedSnapshotError("The revision has no sealed snapshot.");
  let digest: string;
  try {
    digest = createHash("sha256")
      .update(canonicalUtf8(canonicalizeQuoteSnapshot(revision.snapshot)))
      .digest("hex");
  } catch {
    throw new SealedSnapshotError("The sealed snapshot is malformed.");
  }
  if (digest !== revision.snapshot_hash.toLowerCase())
    throw new SealedSnapshotError(
      "The sealed snapshot does not match its recorded hash.",
    );
  return revision.snapshot as CanonicalQuoteSnapshot;
}

function emptyToNull(value: string | null | undefined) {
  return value ? value : null;
}

export function printPropsFromRevision(input: {
  snapshot: CanonicalQuoteSnapshot;
  issuedAt: string;
  issuedActor: string;
  /** The organization's IANA time zone, so the issue time never depends on the server's. */
  timeZone: string;
}): IssuedPrintProps {
  const { snapshot, issuedAt, issuedActor, timeZone } = input;
  const { seller, buyer, commercial, totals } = snapshot;
  const money = (minor: number) =>
    formatMinor(minor, commercial.currency_code, commercial.locale);
  const schedule: PaymentScheduleEntryV2[] =
    snapshot.format_version === 2 ? snapshot.payment_schedule : [];
  return {
    quote: {
      number: snapshot.quote.number,
      issueDate: commercial.issue_date,
      validUntil: commercial.valid_until,
      currencyCode: commercial.currency_code,
      locale: commercial.locale,
      taxLabel: commercial.tax_label,
      taxMode: commercial.tax_mode,
      notes: commercial.notes,
      subtotalMinor: totals.subtotal_minor,
      discountMinor: totals.discount_minor,
      taxMinor: totals.tax_minor,
      chargesMinor: totals.charges_minor,
      chargeNetMinor: totals.charge_net_minor,
      totalMinor: totals.total_minor,
      issuedAt,
      timeZone,
      revisionNumber: snapshot.quote.revision_number,
    },
    seller: {
      legalName: seller.legal_name,
      addressLine1: seller.address_line1,
      addressLine2: emptyToNull(seller.address_line2),
      city: seller.city,
      region: emptyToNull(seller.region),
      postalCode: emptyToNull(seller.postal_code),
      countryCode: seller.country_code,
      taxIdentifier: seller.tax_identifier,
      contactEmail: seller.contact_email,
      contactPhone: seller.contact_phone,
    },
    customer: {
      name: buyer.name,
      contactName: buyer.contact_name,
      email: buyer.email,
      address: [
        buyer.address_line1,
        buyer.address_line2,
        buyer.city,
        buyer.region,
        buyer.postal_code,
        buyer.country_code,
      ]
        .filter(Boolean)
        .join(", "),
      taxIdentifier: buyer.tax_identifier,
    },
    items: [...snapshot.items]
      .sort((left, right) => left.position - right.position)
      .map((item) => ({
        id: item.id,
        position: item.position,
        sku: item.sku,
        description: item.description,
        unitCode: item.unit_code,
        quantityScaled: item.quantity_scaled,
        quantityScale: item.quantity_scale,
        unitPriceMinor: item.unit_price_minor,
        taxCode: item.tax_code,
        extendedAmountMinor: calculateExtendedLineAmountMinor({
          unitPriceMinor: item.unit_price_minor,
          quantityScaled: item.quantity_scaled,
          quantityScale: item.quantity_scale,
        }),
      })),
    charges: [...snapshot.charges]
      .sort((left, right) => left.position - right.position)
      .map((charge) => ({
        id: charge.id,
        description: charge.description,
        amountMinor: charge.amount_minor,
        taxMinor: charge.tax_minor,
        totalMinor: charge.total_minor,
      })),
    paymentSchedule: presentPaymentSchedule(schedule, money),
    issuedActor,
  };
}

/**
 * Who issued this revision: the activity row written by the issue command for exactly this
 * revision, never the latest issue event of the quote.
 */
export function issuedActorForRevision(
  activity: ReadonlyArray<{
    event_type: string;
    actor_name_snapshot: string | null;
    safe_metadata: unknown;
  }>,
  revisionId: string,
) {
  const match = activity.find(
    (row) =>
      row.event_type === "quote.revision_issue" &&
      typeof row.safe_metadata === "object" &&
      row.safe_metadata !== null &&
      !Array.isArray(row.safe_metadata) &&
      (row.safe_metadata as Record<string, unknown>).revision_id === revisionId,
  );
  return match?.actor_name_snapshot ?? "Trace user";
}

/**
 * Fallback for an issued quote whose current revision has no sealed snapshot (a pre-revision
 * "legacy capture"). It prints from the quote rows exactly as the page always did. Such a
 * quote has no sealed content and therefore never gets a PDF.
 */
export type LegacyPrintRows = {
  quote: {
    number: string;
    issue_date: string;
    valid_until: string;
    currency_code: string;
    locale: string;
    tax_label: string;
    tax_mode: "exclusive" | "inclusive";
    notes: string;
    subtotal_minor: number;
    discount_minor: number;
    tax_minor: number | null;
    charges_minor: number | null;
    charge_net_minor: number;
    total_minor: number;
    issued_at: string;
    customer_name_snapshot: string | null;
    contact_name_snapshot: string | null;
    email_snapshot: string | null;
    billing_address_line1_snapshot: string | null;
    billing_address_line2_snapshot: string | null;
    billing_city_snapshot: string | null;
    billing_region_snapshot: string | null;
    billing_postal_code_snapshot: string | null;
    billing_country_code_snapshot: string | null;
    tax_identifier_snapshot: string | null;
  };
  seller: IssuedPrintProps["seller"];
  items: Array<{
    id: string;
    position: number;
    sku_snapshot: string;
    description_snapshot: string;
    unit_code_snapshot: string;
    quantity_scaled: number;
    quantity_scale: number;
    unit_price_minor_snapshot: number;
    tax_code_snapshot: string;
  }>;
  charges: Array<{
    id: string;
    description_snapshot: string;
    amount_minor: number;
    tax_minor: number;
    charge_total_minor: number;
  }>;
  issuedActor: string;
  timeZone: string;
};

export function printPropsFromLegacyRows(
  rows: LegacyPrintRows,
): IssuedPrintProps {
  const { quote } = rows;
  return {
    quote: {
      number: quote.number,
      issueDate: quote.issue_date,
      validUntil: quote.valid_until,
      currencyCode: quote.currency_code,
      locale: quote.locale,
      taxLabel: quote.tax_label,
      taxMode: quote.tax_mode,
      notes: quote.notes,
      subtotalMinor: quote.subtotal_minor,
      discountMinor: quote.discount_minor,
      taxMinor: quote.tax_minor ?? 0,
      chargesMinor: quote.charges_minor ?? 0,
      chargeNetMinor: quote.charge_net_minor,
      totalMinor: quote.total_minor,
      issuedAt: quote.issued_at,
      timeZone: rows.timeZone,
    },
    seller: rows.seller,
    customer: {
      name: quote.customer_name_snapshot ?? "Customer",
      contactName: quote.contact_name_snapshot ?? "",
      email: quote.email_snapshot ?? "",
      address: [
        quote.billing_address_line1_snapshot,
        quote.billing_address_line2_snapshot,
        quote.billing_city_snapshot,
        quote.billing_region_snapshot,
        quote.billing_postal_code_snapshot,
        quote.billing_country_code_snapshot,
      ]
        .filter(Boolean)
        .join(", "),
      taxIdentifier: quote.tax_identifier_snapshot,
    },
    items: rows.items.map((item) => ({
      id: item.id,
      position: item.position,
      sku: item.sku_snapshot,
      description: item.description_snapshot,
      unitCode: item.unit_code_snapshot,
      quantityScaled: item.quantity_scaled,
      quantityScale: item.quantity_scale,
      unitPriceMinor: item.unit_price_minor_snapshot,
      taxCode: item.tax_code_snapshot,
      extendedAmountMinor: calculateExtendedLineAmountMinor({
        unitPriceMinor: item.unit_price_minor_snapshot,
        quantityScaled: item.quantity_scaled,
        quantityScale: item.quantity_scale,
      }),
    })),
    charges: rows.charges.map((charge) => ({
      id: charge.id,
      description: charge.description_snapshot,
      amountMinor: charge.amount_minor,
      taxMinor: charge.tax_minor,
      totalMinor: charge.charge_total_minor,
    })),
    paymentSchedule: [],
    issuedActor: rows.issuedActor,
  };
}
