# Fonts bundled for the issued-quotation PDF

The PDF renderer (`lib/quote-pdf/render.ts`) embeds these files as `data:` URIs so a
render needs no network access and does not depend on fonts installed on the host.

| Family                          | Files                    | License                                                 |
| ------------------------------- | ------------------------ | ------------------------------------------------------- |
| Inter (variable, wght)          | `inter/*.woff2`          | SIL Open Font License 1.1, see `inter/OFL.txt`          |
| Source Serif 4 (variable, wght) | `source-serif-4/*.woff2` | SIL Open Font License 1.1, see `source-serif-4/OFL.txt` |
| JetBrains Mono (variable, wght) | `jetbrains-mono/*.woff2` | SIL Open Font License 1.1, see `jetbrains-mono/OFL.txt` |

Source: the `latin` and `latin-ext` normal-style `wght` subsets from the npm packages
`@fontsource-variable/inter@5.3.0`, `@fontsource-variable/source-serif-4@5.3.0` and
`@fontsource-variable/jetbrains-mono@5.3.0` (the same Google Fonts subsets that
`next/font/google` serves). Each `OFL.txt` is the license file shipped in that package,
unmodified. The font files are not modified.

`latin-ext` is included because it carries the rupee sign (U+20B9), which the quotation
shows for INR. Scripts outside Latin (for example Devanagari) are not covered; those
glyphs fall back to whatever system font the renderer finds.

The SIL OFL permits bundling and redistribution with software, provided the license text
stays with the fonts and the fonts are not sold on their own.
