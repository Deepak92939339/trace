/** Strict, fail-closed SVG subset. It parses a bounded XML grammar, never repairs HTML. */
const TAGS = new Set(["svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan", "defs", "linearGradient", "radialGradient", "stop", "clipPath", "title", "desc"]);
const NUMERIC = new Set(["x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry", "width", "height", "stroke-width", "stroke-miterlimit", "stroke-dashoffset", "font-size", "dx", "dy", "fx", "fy"]);
const COMMON = new Set(["id", "fill", "stroke", "opacity", "fill-opacity", "stroke-opacity", "fill-rule", "clip-rule", "stroke-linecap", "stroke-linejoin", "stroke-dasharray", "transform", "clip-path"]);
const SPECIFIC: Record<string, readonly string[]> = {
  svg: ["xmlns", "viewBox", "preserveAspectRatio", "version"], path: ["d"], polygon: ["points"], polyline: ["points"],
  text: ["text-anchor", "font-family", "font-weight"], tspan: ["text-anchor", "font-family", "font-weight"],
  linearGradient: ["gradientUnits", "gradientTransform"], radialGradient: ["gradientUnits", "gradientTransform"],
  stop: ["offset", "stop-color", "stop-opacity"], clipPath: ["clipPathUnits"],
};
const escapeXml = (text: string) => text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
function decodeXml(text: string): string {
  if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(text)) throw new Error("studio_asset_svg_invalid");
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[name]!);
}
const numbers = (s: string) => /^[\s,\d.eE+%-]+$/.test(s) && !/(?:nan|infinity)/i.test(s);
const identifier = (s: string) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(s);
function attributeAllowed(tag: string, key: string, value: string): boolean {
  if (value.length > (key === "d" || key === "points" ? 8192 : 512) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return false;
  if (NUMERIC.has(key)) return numbers(value) && value.length <= 80;
  if (!COMMON.has(key) && !SPECIFIC[tag]?.includes(key)) return false;
  if (key === "xmlns") return value === "http://www.w3.org/2000/svg";
  if (key === "id") return identifier(value);
  if (["fill", "stroke", "stop-color"].includes(key)) return /^(?:none|currentColor|transparent|black|white|red|green|blue|#[0-9a-fA-F]{3,8}|url\(#[A-Za-z][A-Za-z0-9_-]{0,63}\))$/.test(value);
  if (key === "clip-path") return /^url\(#[A-Za-z][A-Za-z0-9_-]{0,63}\)$/.test(value);
  if (["opacity", "fill-opacity", "stroke-opacity", "stop-opacity", "offset"].includes(key)) return /^(?:0(?:\.\d{1,6})?|1(?:\.0{1,6})?|\d{1,2}(?:\.\d{1,3})?%|100%)$/.test(value);
  if (["transform", "gradientTransform"].includes(key)) return /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([\s,\d.eE+-]+\)\s*)+$/.test(value);
  if (key === "d") return /^[MmZzLlHhVvCcSsQqTtAa\s,\d.eE+-]+$/.test(value);
  if (key === "points" || key === "viewBox" || key === "stroke-dasharray") return value === "none" || numbers(value);
  const enums: Record<string, readonly string[]> = {
    "fill-rule": ["nonzero", "evenodd"], "clip-rule": ["nonzero", "evenodd"], "stroke-linecap": ["butt", "round", "square"], "stroke-linejoin": ["miter", "round", "bevel"],
    "preserveAspectRatio": ["none", "xMinYMin meet", "xMidYMid meet", "xMidYMid slice"], version: ["1.0", "1.1"],
    "text-anchor": ["start", "middle", "end"], "font-family": ["sans-serif", "serif", "monospace"], "font-weight": ["normal", "bold", "400", "500", "600", "700"],
    gradientUnits: ["objectBoundingBox", "userSpaceOnUse"], clipPathUnits: ["objectBoundingBox", "userSpaceOnUse"],
  };
  return enums[key]?.includes(value) ?? false;
}
export function sanitizeSvg(input: string): string {
  const fail = (): never => { throw new Error("studio_asset_svg_invalid"); };
  if (new TextEncoder().encode(input).byteLength > 131072 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input)) fail();
  let source = input.replace(/^\uFEFF/, "").trim();
  source = source.replace(/^<\?xml\s+version=["']1\.0["'](?:\s+encoding=["']UTF-8["'])?\s*\?>\s*/i, "");
  if (/<[!?]/.test(source)) fail(); // no DTDs, entities, processing instructions, comments or CDATA
  const stack: string[] = [], out: string[] = []; let offset = 0, count = 0, rootClosed = false;
  while (offset < source.length) {
    if (source[offset] !== "<") {
      const next = source.indexOf("<", offset), end = next < 0 ? source.length : next;
      const text = source.slice(offset, end);
      if (text.trim() && (!stack.length || !["text", "tspan", "title", "desc"].includes(stack[stack.length - 1]!))) fail();
      out.push(escapeXml(decodeXml(text))); offset = end; continue;
    }
    const end = source.indexOf(">", offset); if (end < 0) fail();
    const raw = source.slice(offset + 1, end); offset = end + 1;
    if (raw.startsWith("/")) {
      const tag = raw.slice(1).trim(); if (tag !== stack.pop()) fail();
      out.push(`</${tag}>`); if (!stack.length) rootClosed = true; continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9]*)([\s\S]*?)(\/)?$/.exec(raw); if (!match) fail();
    const tag = match![1]!, attrs = match![2]!, selfClosing = Boolean(match![3]);
    if (!TAGS.has(tag) || rootClosed || (!stack.length && tag !== "svg") || (stack.length && tag === "svg") || ++count > 256 || stack.length >= 16) fail();
    const seen = new Set<string>(); let consumed = 0; const rendered: string[] = [];
    for (const attr of attrs.matchAll(/\s+([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/g)) {
      if (attr.index !== consumed) fail(); consumed = attr.index + attr[0].length;
      const key = attr[1]!, value = decodeXml(attr[2] ?? attr[3] ?? "");
      if (seen.has(key) || !attributeAllowed(tag, key, value)) fail(); seen.add(key);
      rendered.push(` ${key}="${escapeXml(value)}"`);
    }
    if (attrs.slice(consumed).trim()) fail();
    if (tag === "svg" && !seen.has("xmlns")) rendered.unshift(' xmlns="http://www.w3.org/2000/svg"');
    out.push(`<${tag}${rendered.join("")}${selfClosing ? "/" : ""}>`);
    if (!selfClosing) stack.push(tag); else if (!stack.length) rootClosed = true;
  }
  if (stack.length || !rootClosed) fail();
  return out.join("");
}
export type AssetMime = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";
export function validateAsset(mime: string, bytes: Uint8Array): { mime: AssetMime; bytes: Uint8Array } {
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(mime) || !bytes.length || bytes.length > (mime === "image/svg+xml" ? 131072 : 524288)) throw new Error("studio_asset_invalid");
  if (mime === "image/svg+xml") {
    let text: string; try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new Error("studio_asset_svg_invalid"); }
    const clean = new TextEncoder().encode(sanitizeSvg(text));
    if (clean.length > 131072) throw new Error("studio_asset_invalid");
    return { mime, bytes: clean };
  }
  const prefix = (at: number, values: number[]) => values.every((v, i) => bytes[at + i] === v);
  if (!(mime === "image/png" ? prefix(0, [137, 80, 78, 71, 13, 10, 26, 10]) : mime === "image/jpeg" ? prefix(0, [255, 216, 255]) : bytes.length >= 12 && prefix(0, [82, 73, 70, 70]) && prefix(8, [87, 69, 66, 80]))) throw new Error("studio_asset_magic_invalid");
  return { mime: mime as AssetMime, bytes: bytes.slice() };
}
/** Revalidates even a blob uploaded by direct RPC. No caller-supplied data URL is accepted. */
export function assetDataUrl(mime: string, bytes: Uint8Array): string | null {
  try {
    const safe = validateAsset(mime, bytes);
    let binary = ""; for (const byte of safe.bytes) binary += String.fromCharCode(byte);
    return `data:${safe.mime};base64,${btoa(binary)}`;
  } catch { return null; }
}
