export const TOKEN_NAMES = [
  "seller.name",
  "seller.tax_id",
  "customer.name",
  "customer.contact",
  "quote.number",
  "quote.rev",
  "quote.date",
  "quote.valid_until",
  "quote.title",
  "totals.grand",
  "totals.subtotal",
  "totals.tax",
] as const;
export type TokenName = (typeof TOKEN_NAMES)[number];
export type TokenValues = Readonly<Record<TokenName, string>>;
export type TokenPart =
  | { type: "text"; value: string }
  | { type: "token"; name: string; value: string; known: boolean };
/** Single pass; replacements never become new tokens. Consumers render these values as text. */
export function tokenParts(text: string, values: TokenValues): TokenPart[] {
  const parts: TokenPart[] = [];
  let last = 0;
  for (const match of text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    if (match.index > last)
      parts.push({ type: "text", value: text.slice(last, match.index) });
    const name = match[1]!.trim(),
      known = TOKEN_NAMES.includes(name as TokenName);
    parts.push({
      type: "token",
      name,
      known,
      value: known ? values[name as TokenName] : "",
    });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", value: text.slice(last) });
  return parts;
}
export function resolveTokens(text: string, values: TokenValues): string {
  return tokenParts(text, values)
    .map((p) => p.value)
    .join("");
}
export function unknownTokens(text: string): string[] {
  return [
    ...new Set(
      [...text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)]
        .map((m) => m[1]!.trim())
        .filter((n) => !TOKEN_NAMES.includes(n as TokenName)),
    ),
  ];
}
