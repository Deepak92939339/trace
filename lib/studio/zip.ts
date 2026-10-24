/** Stored ZIP32 with UTF-8 names, a deterministic DOS epoch and CRC-32. No dependencies. */
export const WORKSPACE_MAX_BYTES = 50 * 1024 * 1024;
export const WORKSPACE_MAX_REVISIONS = 200;
const TABLE = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
export function crc32(bytes: Uint8Array): number { let c = 0xffffffff; for (const byte of bytes) c = TABLE[(c ^ byte) & 255]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export type ZipEntry = { name: string; bytes: Uint8Array };
export function storedZip(entries: readonly ZipEntry[], maxBytes = WORKSPACE_MAX_BYTES): Uint8Array {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 22 || maxBytes > 0xffffffff || entries.length > 65535) throw new Error("studio_export_too_large");
  const seen = new Set<string>(); let size = 22;
  const prepared = entries.map(entry => {
    const name = entry.name.normalize("NFC"), utf8 = new TextEncoder().encode(name);
    if (!name || name.startsWith("/") || /[\\\u0000-\u001f\u007f:]/.test(name) || name.split("/").some(p => !p || p === "." || p === "..") || seen.has(name) || utf8.length > 65535) throw new Error("studio_zip_path_invalid");
    seen.add(name); size += 30 + 46 + 2 * utf8.length + entry.bytes.length;
    if (size > maxBytes) throw new Error("studio_export_too_large");
    return { ...entry, utf8, crc: crc32(entry.bytes) };
  });
  const out = new Uint8Array(size), view = new DataView(out.buffer); let at = 0;
  const u16 = (v: number) => { view.setUint16(at, v, true); at += 2; };
  const u32 = (v: number) => { view.setUint32(at, v, true); at += 4; };
  const offsets: number[] = [];
  for (const e of prepared) {
    offsets.push(at); u32(0x04034b50); u16(20); u16(0x800); u16(0); u16(0); u16(33); u32(e.crc); u32(e.bytes.length); u32(e.bytes.length); u16(e.utf8.length); u16(0);
    out.set(e.utf8, at); at += e.utf8.length; out.set(e.bytes, at); at += e.bytes.length;
  }
  const central = at;
  prepared.forEach((e, i) => {
    u32(0x02014b50); u16(20); u16(20); u16(0x800); u16(0); u16(0); u16(33); u32(e.crc); u32(e.bytes.length); u32(e.bytes.length); u16(e.utf8.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(offsets[i]!);
    out.set(e.utf8, at); at += e.utf8.length;
  });
  const centralSize = at - central;
  u32(0x06054b50); u16(0); u16(0); u16(prepared.length); u16(prepared.length); u32(centralSize); u32(central); u16(0);
  return out;
}
/** CSV protects spreadsheet consumers from formulas; values are always quoted. */
export function csv(rows: readonly (readonly unknown[])[]): string {
  return rows.map(row => row.map(value => {
    let text = value == null ? "" : String(value);
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(",")).join("\r\n") + "\r\n";
}
