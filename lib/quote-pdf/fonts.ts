import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local copies of the three families the application loads through next/font/google
 * (Inter, Source Serif 4, JetBrains Mono), embedded into the PDF document as data: URIs so a
 * render needs no network and no fonts installed on the host. Licenses: SIL OFL 1.1, stored
 * beside the files (see fonts/README.md).
 */
const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

type Family = {
  family: string;
  directory: string;
  weight: string;
  variable: string;
  fallback: string;
};

export const PDF_FONT_FAMILIES: readonly Family[] = [
  {
    family: "Inter",
    directory: "inter",
    weight: "100 900",
    variable: "--font-sans",
    fallback: 'ui-sans-serif, "Helvetica Neue", Arial, sans-serif',
  },
  {
    family: "Source Serif 4",
    directory: "source-serif-4",
    weight: "200 900",
    variable: "--font-serif",
    fallback: 'Georgia, "Times New Roman", serif',
  },
  {
    family: "JetBrains Mono",
    directory: "jetbrains-mono",
    weight: "100 800",
    variable: "--font-mono",
    fallback: 'ui-monospace, Menlo, "Courier New", monospace',
  },
];

const SUBSETS = [
  { name: "latin", range: LATIN },
  { name: "latin-ext", range: LATIN_EXT },
] as const;

export function fontDirectory() {
  return path.join(process.cwd(), "lib", "quote-pdf", "fonts");
}

let cached: Promise<string> | undefined;

/** `@font-face` rules plus the variables app/tokens.css reads, built once per process. */
export function pdfFontCss(): Promise<string> {
  cached ??= (async () => {
    const rules: string[] = [];
    const variables: string[] = [];
    for (const family of PDF_FONT_FAMILIES) {
      variables.push(
        `${family.variable}: "${family.family}", ${family.fallback};`,
      );
      for (const subset of SUBSETS) {
        const file = path.join(
          fontDirectory(),
          family.directory,
          `${family.directory}-${subset.name}-wght-normal.woff2`,
        );
        const data = (await readFile(file)).toString("base64");
        rules.push(
          `@font-face{font-family:"${family.family}";font-style:normal;font-weight:${family.weight};font-display:block;src:url(data:font/woff2;base64,${data}) format("woff2");unicode-range:${subset.range};}`,
        );
      }
    }
    return `${rules.join("\n")}\nhtml{${variables.join("")}}`;
  })();
  cached.catch(() => {
    cached = undefined;
  });
  return cached;
}
