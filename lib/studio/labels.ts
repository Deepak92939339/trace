import { BLOCK_TYPES, type BlockType } from "./layout-schema.ts";

/** One human label per block type, used by the palette, block list, live-region announcements and inspector headings. */
export const BLOCK_LABELS: Record<BlockType, string> = {
  letterhead: "Letterhead", logo: "Logo", cover: "Cover", quote_meta: "Quote details", parties: "Parties", intro: "Introduction",
  line_items: "Line items", totals: "Totals", extra_charges: "Extra charges", payment_schedule: "Payment schedule", terms: "Terms",
  acceptance: "Acceptance", notes: "Notes", spacer: "Spacer", free_text: "Free text", footer: "Footer",
};
if (Object.keys(BLOCK_LABELS).length !== BLOCK_TYPES.length) throw new Error("studio_block_labels_incomplete");
export const blockLabel = (type: string) => BLOCK_LABELS[type as BlockType] ?? sentence(type);

const FIELD_LABELS: Record<string, string> = {
  align: "Alignment", showAddress: "Show address", showContact: "Show contact details", variant: "Style", height: "Height", title: "Title",
  subtitle: "Subtitle", abstract: "Summary", meta: "Details row", tone: "Tone", fields: "Fields", direction: "Direction", labels: "Show labels",
  layout: "Layout", tint: "Tinted background", text: "Text", columns: "Columns", zebra: "Striped rows", boxed: "Boxed table",
  specs: "Show specifications", showExtras: "Show extra charges", showNotes: "Show notes", showExpiry: "Show expiry date", rule: "Show rule",
  right: "Right-hand text", pageNumbers: "Page numbers", footer_line: "Footer line", registration_line: "Registration line",
};
export const fieldLabel = (key: string) => FIELD_LABELS[key] ?? sentence(key);

const VALUE_LABELS: Record<string, string> = {
  sku: "SKU", qty: "Quantity", tax_code: "Tax code", valid_until: "Valid until", number: "Reference", date: "Issue date",
  "two-col": "Two columns", stacked: "Stacked", x: "Page x", x_of_y: "Page x of y", columns: "Columns", split: "Split",
};
export const optionLabel = (value: string | number) => VALUE_LABELS[String(value)] ?? sentence(String(value));

/** Activity actions such as "template.default_set" read as "Template default set". */
export const actionLabel = (action: string) => sentence(action.replace(/\./g, " "));

/** "x_of_y" -> "X of y", "showAddress" -> "Show address", "hairline" -> "Hairline". */
function sentence(value: string) {
  const words = value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
