/**
 * Conservative text-wrapping estimate used only to size printed pages.
 *
 * The browser does the real wrapping. These functions answer "how many lines can this text take
 * in a column of this width" with font-metric approximations for the Inter face the print
 * document uses, deliberately rounded toward wider text so that the estimate is never lower than
 * what Chromium produces. An over-estimate only leaves a little spare room on a page; an
 * under-estimate would overflow it, which is what the page model exists to prevent.
 */

const MM_PER_PT = 25.4 / 72;
/** Widths above the true value by this factor (covers kerning variance and font fallback). */
const SAFETY = 1.06;

export type TextLine = { start: number; end: number };

/** Approximate advance width of one character, in em, for Inter. */
export function charWidthEm(character: string): number {
  const code = character.codePointAt(0)!;
  if (character === " ") return 0.28;
  if ("iIl|!.,:;'`".includes(character)) return 0.3;
  if ("jtfr()[]{}/\\-".includes(character)) return 0.4;
  if (character === "m" || character === "M") return 0.95;
  if (character === "w" || character === "W") return 0.9;
  if (code >= 48 && code <= 57) return 0.62;
  if (code >= 65 && code <= 90) return 0.7;
  if (code >= 97 && code <= 122) return 0.58;
  // CJK, fullwidth forms, emoji and other wide glyphs.
  if (
    (code >= 0x2e80 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60) ||
    code >= 0x1f000
  )
    return 1.1;
  return 0.66;
}

/** Number of em that fit in a column of `widthMm` at `fontPt`. */
export function capacityEm(widthMm: number, fontPt: number) {
  return widthMm / (fontPt * MM_PER_PT);
}

export type WrapOptions = {
  /** Column width in em at the font size in use. */
  capacityEm: number;
  /** Bold text is wider. */
  bold?: boolean;
};

/**
 * Greedy word wrap with explicit newlines honoured and over-long words broken anywhere, as
 * `overflow-wrap: anywhere` does. Returns each estimated visual line as a [start, end) range of
 * the original string, so a caller can cut the text at a line boundary.
 */
export function wrapText(text: string, options: WrapOptions): TextLine[] {
  const scale = SAFETY * (options.bold ? 1.07 : 1);
  const limit = options.capacityEm;
  const lines: TextLine[] = [];
  let segmentStart = 0;
  for (;;) {
    const newline = text.indexOf("\n", segmentStart);
    const segmentEnd = newline === -1 ? text.length : newline;
    wrapSegment(text, segmentStart, segmentEnd, limit, scale, lines);
    if (newline === -1) break;
    segmentStart = newline + 1;
  }
  return lines;
}

function wrapSegment(
  text: string,
  start: number,
  end: number,
  limit: number,
  scale: number,
  out: TextLine[],
) {
  if (start === end) {
    out.push({ start, end });
    return;
  }
  const characters = Array.from(text.slice(start, end));
  // Offsets of each code point within `text`.
  const offsets: number[] = [];
  let offset = start;
  for (const character of characters) {
    offsets.push(offset);
    offset += character.length;
  }
  offsets.push(end);

  let lineStart = 0;
  let width = 0;
  let lastSpace = -1;
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    const advance = charWidthEm(character) * scale;
    if (width + advance > limit && character !== " " && index > lineStart) {
      let breakAt: number;
      let next: number;
      if (lastSpace > lineStart) {
        breakAt = lastSpace;
        next = lastSpace + 1;
      } else {
        breakAt = index;
        next = index;
      }
      out.push({ start: offsets[lineStart]!, end: offsets[breakAt]! });
      lineStart = next;
      width = 0;
      lastSpace = -1;
      for (let back = lineStart; back < index; back += 1) {
        width += charWidthEm(characters[back]!) * scale;
        if (characters[back] === " ") lastSpace = back;
      }
    }
    width += advance;
    if (character === " ") lastSpace = index;
  }
  out.push({ start: offsets[lineStart]!, end });
}

export function countLines(text: string, options: WrapOptions) {
  return Math.max(1, wrapText(text, options).length);
}
