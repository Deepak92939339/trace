import type { Brand, Layout } from "./layout-schema.ts";
import type { TokenValues } from "./tokens.ts";
import { resolveTokens } from "./tokens.ts";

/** CSS quoted string, bounded by Unicode code points. Hex escapes consume their own terminator.
 * Escape '<' as well so the result can safely inhabit an HTML style raw-text element.
 * Nothing is stripped: punctuation remains text inside the quotes. */
export function cssString(value: string): string {
  let result = '"';
  for (const character of [...value].slice(0, 200)) {
    const code = character.codePointAt(0)!;
    if (character === "\\") result += "\\\\";
    else if (character === '"') result += '\\"';
    else if (code < 0x20 || character === "<") result += `\\${code.toString(16)} `;
    else result += character;
  }
  return result + '"';
}
export function studioPageCss(layout: Layout, brand: Brand, tokens: TokenValues): string {
  const footers = layout.blocks.filter(b => b.type === "footer");
  const last = footers.at(-1);
  const pieces = footers.flatMap(b => [resolveTokens(b.props.text ?? "",tokens),resolveTokens(b.props.right ?? "",tokens)]).filter(Boolean);
  pieces.push(brand.footer_line,brand.registration_line);
  const content = pieces.filter(Boolean).map(cssString).join(' "\\a " ') || '""';
  const numbering = last?.props.pageNumbers ?? "none";
  const numbers = numbering === "x_of_y" ? '"Page " counter(page) " of " counter(pages)' : numbering === "x" ? '"Page " counter(page)' : "none";
  const margin = {narrow:"10mm",normal:"16mm",wide:"22mm"}[layout.page.margin];
  return `@page studio-page{size:${layout.page.size};margin:${margin};@bottom-center{content:${content};white-space:pre-wrap;font-size:7pt;}@bottom-right{content:${numbers};font-size:7pt;}}`;
}
