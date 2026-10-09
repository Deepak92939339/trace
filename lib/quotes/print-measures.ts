import type { PrintMeasures } from "./print-pagination";
import { capacityEm, countLines, wrapText, type TextLine } from "./print-text";

/**
 * Turns the text of an issued quotation into the line counts the page model needs. The column
 * widths below are the print CSS's (content width 210 - 2 x 16 = 178 mm; the item table's first
 * column is 39% with 2 mm cell padding; the totals column is 72 mm with an 8 mm gap; and so on),
 * and every width is rounded down a little so that estimates err toward more lines.
 */
export type PrintMeasureSource = {
  items: ReadonlyArray<{ sku: string; description: string }>;
  charges: ReadonlyArray<{ description: string }>;
  schedule: ReadonlyArray<{ label: string }>;
  notes: string;
  seller: {
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
  } | null;
  customer: {
    name: string;
    contactName: string;
    email: string;
    address: string;
    taxIdentifier: string | null;
  };
};

const CONTENT_MM = 178;
const ITEM_CELL = capacityEm(CONTENT_MM * 0.39 - 4.5, 8.5);
const CHARGE_TEXT = capacityEm(CONTENT_MM - 72 - 8 - 8 - 32, 9.75);
const SCHEDULE_LABEL = capacityEm(CONTENT_MM / 4 - 1.5, 8.5);
const NOTES = capacityEm(CONTENT_MM - 1, 9);
const PARTY_INNER_MM = (CONTENT_MM - 7) / 2 - 9;
const PARTY_SMALL = capacityEm(PARTY_INNER_MM, 8);
const PARTY_STRONG = capacityEm(PARTY_INNER_MM, 9.75);
const PARTY_NOTE = capacityEm(PARTY_INNER_MM, 8.5);

/** The notes split into estimated visual lines, so a caller can cut them at a page boundary. */
export function noteLines(notes: string): TextLine[] {
  return notes === "" ? [] : wrapText(notes, { capacityEm: NOTES });
}

function partyBox(strongLines: number, groups: number[]) {
  // padding + top border, label, gap, name, then one group per paragraph of small text.
  let height = 9 + 4.2 + 1.5 + 5.3 * strongLines;
  for (const lines of groups) height += 1.5 + 4 * lines;
  return height;
}

export function printMeasures(source: PrintMeasureSource): PrintMeasures {
  const small = (text: string) => countLines(text, { capacityEm: PARTY_SMALL });
  const seller = source.seller;
  let sellerHeight: number;
  if (seller) {
    const address = [
      seller.addressLine1,
      seller.addressLine2,
      [seller.city, seller.region, seller.postalCode]
        .filter(Boolean)
        .join(", "),
      seller.countryCode,
    ].filter((line): line is string => Boolean(line));
    const addressLines = address.reduce((sum, line) => sum + small(line), 0);
    const groups = [addressLines + 0.35 * (address.length - 1)];
    if (seller.taxIdentifier)
      groups.push(small(`Tax ID: ${seller.taxIdentifier}`));
    const contact = [seller.contactEmail, seller.contactPhone]
      .filter(Boolean)
      .join(" · ");
    if (contact) groups.push(small(contact));
    sellerHeight = partyBox(
      countLines(seller.legalName, { capacityEm: PARTY_STRONG, bold: true }),
      groups,
    );
  } else {
    sellerHeight = partyBox(0, [
      countLines(
        "Seller identity was not captured when this pre-R local quotation was issued.",
        { capacityEm: PARTY_NOTE },
      ) * 1.1,
    ]);
  }
  const customer = source.customer;
  const customerGroups = [
    small([customer.contactName, customer.email].filter(Boolean).join(" · ")),
    small(customer.address),
  ];
  if (customer.taxIdentifier)
    customerGroups.push(small(`Tax ID: ${customer.taxIdentifier}`));
  const customerHeight = partyBox(
    countLines(customer.name, { capacityEm: PARTY_STRONG, bold: true }),
    customerGroups,
  );

  return {
    itemLines: source.items.map(
      (item) =>
        countLines(item.sku, { capacityEm: ITEM_CELL, bold: true }) +
        countLines(item.description, { capacityEm: ITEM_CELL }),
    ),
    chargeLines: source.charges.map((charge) =>
      countLines(charge.description, { capacityEm: CHARGE_TEXT }),
    ),
    scheduleLines: source.schedule.map((entry) =>
      countLines(entry.label, { capacityEm: SCHEDULE_LABEL }),
    ),
    notesLines: noteLines(source.notes).length,
    partiesMm: 14 + Math.max(sellerHeight, customerHeight),
  };
}
