import { Fragment, isValidElement, type ReactNode } from "react";

/**
 * Serializes the element tree of a hook-free React component to static HTML.
 *
 * Why this exists: Next.js forbids importing react-dom/server in the server-component graph
 * (route handlers included), and the PDF needs exactly the HTML of IssuedPrintDocument. The
 * component is a pure function over host elements, so its tree can be walked directly. The
 * output is byte-identical to react-dom/server's renderToStaticMarkup for that component, which
 * tests/unit/quote-pdf-static-markup.test.ts asserts on every fixture; anything outside the
 * supported subset (hooks, events, raw HTML, numeric styles, async components) throws instead of
 * rendering something different.
 */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);

const ATTRIBUTE_NAMES: Record<string, string> = {
  className: "class",
  htmlFor: "for",
};

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}

function styleText(style: unknown) {
  if (typeof style !== "object" || style === null || Array.isArray(style))
    throw new TypeError("style must be an object.");
  return Object.entries(style as Record<string, unknown>)
    .filter(
      ([, value]) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        value !== false,
    )
    .map(([name, value]) => {
      if (typeof value !== "string")
        throw new TypeError(`Unsupported style value for ${name}.`);
      const property = name.startsWith("--")
        ? name
        : name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      return `${property}:${value}`;
    })
    .join(";");
}

function attributes(props: Record<string, unknown>) {
  let out = "";
  for (const [name, value] of Object.entries(props)) {
    if (name === "children") continue;
    if (
      name === "dangerouslySetInnerHTML" ||
      /^on[A-Z]/.test(name) ||
      name === "ref"
    )
      throw new TypeError(`Unsupported prop ${name}.`);
    const attribute = ATTRIBUTE_NAMES[name] ?? name;
    // React stringifies booleans on data-* and aria-* attributes instead of dropping them.
    if (typeof value === "boolean" && /^(?:data|aria)-/.test(name)) {
      out += ` ${attribute}="${value}"`;
      continue;
    }
    if (value === null || value === undefined || value === false) continue;
    if (name === "style") {
      const text = styleText(value);
      if (text) out += ` style="${escapeHtml(text)}"`;
    } else if (value === true) {
      out += ` ${attribute}=""`;
    } else if (typeof value === "string" || typeof value === "number") {
      out += ` ${attribute}="${escapeHtml(String(value))}"`;
    } else {
      throw new TypeError(`Unsupported value for prop ${name}.`);
    }
  }
  return out;
}

function render(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean")
    return "";
  if (typeof node === "string") return escapeHtml(node);
  if (typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map(render).join("");
  if (!isValidElement(node)) throw new TypeError("Unsupported React node.");

  const { type, props } = node as unknown as {
    type: unknown;
    props: Record<string, unknown>;
  };
  if (type === Fragment) return render(props.children as ReactNode);
  if (typeof type === "function") {
    const result = (type as (props: Record<string, unknown>) => unknown)(props);
    if (result instanceof Promise)
      throw new TypeError("Async components are not supported.");
    return render(result as ReactNode);
  }
  if (typeof type !== "string")
    throw new TypeError("Unsupported element type.");
  if (VOID_ELEMENTS.has(type)) {
    if (props.children !== undefined && props.children !== null)
      throw new TypeError(`<${type}> cannot have children.`);
    return `<${type}${attributes(props)}/>`;
  }
  return `<${type}${attributes(props)}>${render(props.children as ReactNode)}</${type}>`;
}

export function renderStaticMarkup(node: ReactNode) {
  return render(node);
}
