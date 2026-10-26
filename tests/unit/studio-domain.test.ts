import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRAND,
  brandIsValid,
  layoutIsValid,
  parseLayout,
} from "../../lib/studio/layout-schema.ts";
import { SYSTEM_TEMPLATES } from "../../lib/studio/templates/index.ts";
import {
  resolveTokens,
  unknownTokens,
  TOKEN_NAMES,
  type TokenValues,
} from "../../lib/studio/tokens.ts";
import {
  sanitizeSvg,
  validateAsset,
  assetDataUrl,
} from "../../lib/studio/assets.ts";
import { crc32, csv, storedZip } from "../../lib/studio/zip.ts";
import {
  editorReducer,
  initialEditorState,
  isDirty,
} from "../../lib/studio/editor-state.ts";
import { hostileSvg, benignSvg } from "../fixtures/studio/svg-corpus.ts";
const base = SYSTEM_TEMPLATES[0].layout;
describe("studio layout twin", () => {
  it.each(SYSTEM_TEMPLATES)(
    "$key matches the immutable SQL built-in",
    (template) => {
      expect(layoutIsValid(template.layout)).toBe(true);
      const sql = readFileSync(
        join(
          process.cwd(),
          "supabase/migrations/20260905100000_stdy1_layout.sql",
        ),
        "utf8",
      );
      const json = sql.match(
        new RegExp("when '" + template.key + "' then '((?:[^']|'')*)'::jsonb"),
      )?.[1];
      expect(JSON.parse(json!.replace(/''/g, "'"))).toEqual(template.layout);
    },
  );
  it("rejects unknown keys, enums, IDs, duplicate singletons and unsafe sizes", () => {
    const invalid: unknown[] = [
      null,
      [],
      { ...base, v: 2 },
      { ...base, html: "x" },
      { ...base, page: { ...base.page, margin: "x" } },
      { ...base, blocks: [] },
      { ...base, blocks: [{ id: "A", type: "spacer", props: {} }] },
      {
        ...base,
        blocks: [
          { id: "a", type: "free_text", props: { text: "x".repeat(2001) } },
        ],
      },
      {
        ...base,
        blocks: [
          ...base.blocks,
          { id: "second", type: "line_items", props: {} },
        ],
      },
      {
        ...base,
        blocks: Array.from({ length: 60 }, (_, i) => ({
          id: `a-${i}`,
          type: "free_text",
          props: { text: "x".repeat(2000) },
        })),
      },
    ];
    invalid.forEach((v) => expect(layoutIsValid(v)).toBe(false));
  });
  it("keeps Unicode char bounds and unknown columns closed", () => {
    expect(
      layoutIsValid({
        ...base,
        blocks: [
          { id: "a", type: "free_text", props: { text: "😀".repeat(2000) } },
        ],
      }),
    ).toBe(true);
    expect(
      layoutIsValid({
        ...base,
        blocks: [{ id: "a", type: "line_items", props: { columns: ["hsn"] } }],
      }),
    ).toBe(false);
    expect(
      layoutIsValid({
        ...base,
        blocks: [
          { id: "a", type: "line_items", props: { columns: ["qty", "qty"] } },
        ],
      }),
    ).toBe(false);
    expect(
      layoutIsValid({
        ...base,
        blocks: [{ id: "a", type: "free_text", props: { text: "\ud800" } }],
      }),
    ).toBe(false);
    const clone = parseLayout(base);
    expect(clone).toEqual(base);
    expect(clone).not.toBe(base);
  });
  it("validates a closed brand", () => {
    expect(brandIsValid(DEFAULT_BRAND)).toBe(true);
    expect(brandIsValid({ ...DEFAULT_BRAND, primary: "red" })).toBe(false);
    expect(brandIsValid({ ...DEFAULT_BRAND, url: "https://evil.test" })).toBe(
      false,
    );
  });
});
describe("closed text tokens", () => {
  const values = Object.fromEntries(
    TOKEN_NAMES.map((k) => [
      k,
      k === "seller.name" ? "{{customer.name}}" : `<${k}>`,
    ]),
  ) as TokenValues;
  it("resolves once, and removes unknown fields", () => {
    expect(resolveTokens("{{seller.name}} {{unknown.x}}", values)).toBe(
      "{{customer.name}} ",
    );
    expect(
      unknownTokens("{{ bad.token }} {{bad.token}} {{quote.number}}"),
    ).toEqual(["bad.token"]);
  });
});
describe("untrusted asset boundary", () => {
  it.each(hostileSvg)("rejects hostile SVG %#", (input) =>
    expect(() => sanitizeSvg(input)).toThrow("studio_asset_svg_invalid"),
  );
  it.each(benignSvg)("accepts benign SVG %# and is idempotent", (input) => {
    const clean = sanitizeSvg(input);
    expect(sanitizeSvg(clean)).toBe(clean);
    expect(
      assetDataUrl("image/svg+xml", new TextEncoder().encode(input)),
    ).toMatch(/^data:image\/svg\+xml;base64,/);
  });
  it("rejects bytes with a misleading MIME and both size limits", () => {
    expect(() =>
      validateAsset("image/png", new Uint8Array([1, 2, 3])),
    ).toThrow();
    expect(() =>
      validateAsset("image/svg+xml", new Uint8Array(131073)),
    ).toThrow();
    expect(() => validateAsset("image/webp", new Uint8Array(524289))).toThrow();
    expect(() =>
      validateAsset("image/svg+xml", new Uint8Array([0xff])),
    ).toThrow();
    expect(
      assetDataUrl("image/svg+xml", new TextEncoder().encode(hostileSvg[0])),
    ).toBeNull();
    expect(
      validateAsset(
        "image/png",
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      ).mime,
    ).toBe("image/png");
    expect(
      validateAsset("image/jpeg", new Uint8Array([255, 216, 255])).mime,
    ).toBe("image/jpeg");
    expect(
      validateAsset(
        "image/webp",
        new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80]),
      ).mime,
    ).toBe("image/webp");
  });
});
describe("stored ZIP", () => {
  it("has the standard CRC, round trips stored bytes and is listed by unzip", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const entries = [
      { name: "data/é.txt", bytes: new TextEncoder().encode("Hello 😀") },
      { name: "empty", bytes: new Uint8Array() },
    ];
    const zip = storedZip(entries);
    expect(storedZip(entries)).toEqual(zip);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0);
    const start = 30 + view.getUint16(26, true),
      size = view.getUint32(18, true);
    const method = view.getUint16(8, true),
      payload = zip.slice(start, start + size);
    const decoded = method === 0 ? payload : inflateRawSync(payload);
    expect(decoded).toEqual(entries[0]!.bytes);
    expect(crc32(decoded)).toBe(view.getUint32(14, true));
    const temp = mkdtempSync(join(tmpdir(), "trace-studio-"));
    try {
      const file = join(temp, "roundtrip.zip");
      writeFileSync(file, zip);
      expect(
        execFileSync("unzip", ["-t", file], { encoding: "utf8" }),
      ).toContain("No errors");
      expect(
        execFileSync("unzip", ["-l", file], { encoding: "utf8" }),
      ).toContain("empty");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
  it("bounds names, duplicate paths, and output bytes", () => {
    for (const name of ["../escape", "/absolute", "a\\b", "x/../x"])
      expect(() => storedZip([{ name, bytes: new Uint8Array() }])).toThrow();
    expect(() =>
      storedZip([
        { name: "a", bytes: new Uint8Array() },
        { name: "a", bytes: new Uint8Array() },
      ]),
    ).toThrow();
    expect(() =>
      storedZip([{ name: "a", bytes: new Uint8Array(100) }], 100),
    ).toThrow("studio_export_too_large");
    expect(csv([["=SUM(A1)", 'a"b']])).toBe('"\'=SUM(A1)","a""b"\r\n');
  });
});
describe("Studio reducer", () => {
  it("add, move, delete, undo, redo, dirty marker and bounded history", () => {
    let s = initialEditorState(base);
    expect(isDirty(s)).toBe(false);
    s = editorReducer(s, {
      type: "add",
      block: { id: "new", type: "free_text", props: { text: "Hi" } },
    });
    expect(isDirty(s)).toBe(true);
    s = editorReducer(s, { type: "move", id: "new", to: 0 });
    expect(s.layout.blocks[0]!.id).toBe("new");
    s = editorReducer(s, { type: "remove", id: "new" });
    s = editorReducer(s, { type: "undo" });
    expect(s.layout.blocks[0]!.id).toBe("new");
    s = editorReducer(s, { type: "redo" });
    expect(s.layout.blocks.some((b) => b.id === "new")).toBe(false);
    for (let i = 0; i < 55; i++)
      s = editorReducer(s, {
        type: "update",
        block: { id: "b-intro", type: "intro", props: { text: String(i) } },
      });
    expect(s.past).toHaveLength(50);
    s = editorReducer(s, { type: "saved" });
    expect(isDirty(s)).toBe(false);
    s = editorReducer(s, { type: "undo" });
    expect(isDirty(s)).toBe(true);
    s = editorReducer(s, {
      type: "update",
      block: { id: "b-intro", type: "intro", props: { text: "new branch" } },
    });
    expect(s.future).toHaveLength(0);
  });
});
