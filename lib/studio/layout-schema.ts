/** Studio layout v1. Mirror: 20260905100000_stdy1_layout.sql. No executable content. */
export type Align = "left" | "center" | "right";
export type Column =
  | "sku"
  | "description"
  | "spec"
  | "qty"
  | "unit"
  | "rate"
  | "tax_code"
  | "amount";
export type MetaField =
  "number" | "revision" | "date" | "valid_until" | "currency";
export type PropMap = {
  letterhead: {
    align?: "left" | "center" | "split";
    showAddress?: boolean;
    showContact?: boolean;
    variant?: "plain" | "band";
  };
  logo: { height?: 18 | 34 | 48 | 64 | 88; align?: Align };
  cover: {
    title?: string;
    subtitle?: string;
    abstract?: string;
    meta?: "columns" | "none";
    tone?: "light" | "dark";
  };
  quote_meta: {
    fields?: readonly MetaField[];
    direction?: "row" | "stack";
    labels?: boolean;
  };
  parties: { layout?: "two-col" | "stacked"; tint?: boolean };
  intro: { text?: string };
  line_items: {
    columns?: readonly Column[];
    zebra?: boolean;
    boxed?: boolean;
    specs?: boolean;
  };
  totals: { layout?: "right" | "full"; showExtras?: boolean };
  extra_charges: Record<string, never>;
  payment_schedule: { layout?: "table" | "cards"; showNotes?: boolean };
  terms: { text?: string; columns?: 1 | 2 };
  acceptance: { text?: string; showExpiry?: boolean };
  notes: { text?: string };
  spacer: { height?: 6 | 12 | 18 | 24 | 36 | 48 | 72; rule?: boolean };
  free_text: { text?: string; align?: Align };
  footer: {
    text?: string;
    right?: string;
    rule?: boolean;
    pageNumbers?: "none" | "x" | "x_of_y";
  };
};
export type BlockType = keyof PropMap;
export type Block = {
  [K in BlockType]: { id: string; type: K; props: PropMap[K] };
}[BlockType];
export type Layout = {
  v: 1;
  page: { size: "A4" | "Letter"; margin: "narrow" | "normal" | "wide" };
  style: {
    corners: "sharp" | "rounded";
    rules: "none" | "hairline" | "bold";
    density: "compact" | "normal" | "airy";
  };
  blocks: readonly Block[];
};
export type Brand = {
  primary: string;
  accent: string;
  font: "sans" | "serif" | "mono-accent";
  logo_asset_id: string | null;
  footer_line: string;
  registration_line: string;
};
export const DEFAULT_BRAND: Brand = Object.freeze({
  primary: "#216b46",
  accent: "#b45309",
  font: "sans",
  logo_asset_id: null,
  footer_line: "",
  registration_line: "",
});

type Rule =
  | "boolean"
  | number
  | readonly (string | number)[]
  | { array: readonly string[] };
export const PROP_RULES: Readonly<
  Record<BlockType, Readonly<Record<string, Rule>>>
> = {
  letterhead: {
    align: ["left", "center", "split"],
    showAddress: "boolean",
    showContact: "boolean",
    variant: ["plain", "band"],
  },
  logo: {
    height: [18, 34, 48, 64, 88],
    align: ["left", "center", "right"],
  },
  cover: {
    title: 2000,
    subtitle: 2000,
    abstract: 2000,
    meta: ["columns", "none"],
    tone: ["light", "dark"],
  },
  quote_meta: {
    fields: {
      array: ["number", "revision", "date", "valid_until", "currency"],
    },
    direction: ["row", "stack"],
    labels: "boolean",
  },
  parties: {
    layout: ["two-col", "stacked"],
    tint: "boolean",
  },
  intro: {
    text: 2000,
  },
  line_items: {
    columns: {
      array: [
        "sku",
        "description",
        "spec",
        "qty",
        "unit",
        "rate",
        "tax_code",
        "amount",
      ],
    },
    zebra: "boolean",
    boxed: "boolean",
    specs: "boolean",
  },
  totals: {
    layout: ["right", "full"],
    showExtras: "boolean",
  },
  extra_charges: {},
  payment_schedule: {
    layout: ["table", "cards"],
    showNotes: "boolean",
  },
  terms: {
    text: 2000,
    columns: [1, 2],
  },
  acceptance: {
    text: 2000,
    showExpiry: "boolean",
  },
  notes: {
    text: 2000,
  },
  spacer: {
    height: [6, 12, 18, 24, 36, 48, 72],
    rule: "boolean",
  },
  free_text: {
    text: 2000,
    align: ["left", "center", "right"],
  },
  footer: {
    text: 2000,
    right: 2000,
    rule: "boolean",
    pageNumbers: ["none", "x", "x_of_y"],
  },
};
export const BLOCK_TYPES = Object.keys(PROP_RULES) as BlockType[];
const own = (o: object, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" &&
  v !== null &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);
const closed = (
  v: unknown,
  keys: readonly string[],
): v is Record<string, unknown> =>
  object(v) && Object.keys(v).every((k) => keys.includes(k));
const oneOf = (v: unknown, options: readonly unknown[]) => options.includes(v);
const length = (v: string) => [...v].length;
const validText = (v: string) =>
  !v.includes("\u0000") &&
  new TextDecoder().decode(new TextEncoder().encode(v)) === v;
/** Same normalization as canonical_json_v1; ordering doesn't affect byte length. */
function normalized(value: unknown): unknown {
  if (typeof value === "string") return value.normalize("NFC");
  if (Array.isArray(value)) return value.map(normalized);
  if (object(value))
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k.normalize("NFC"),
        normalized(v),
      ]),
    );
  return value;
}
export function layoutIsValid(value: unknown): value is Layout {
  try {
    if (
      !closed(value, ["v", "page", "style", "blocks"]) ||
      value.v !== 1 ||
      !closed(value.page, ["size", "margin"]) ||
      !oneOf(value.page.size, ["A4", "Letter"]) ||
      !oneOf(value.page.margin, ["narrow", "normal", "wide"]) ||
      !closed(value.style, ["corners", "rules", "density"]) ||
      !oneOf(value.style.corners, ["sharp", "rounded"]) ||
      !oneOf(value.style.rules, ["none", "hairline", "bold"]) ||
      !oneOf(value.style.density, ["compact", "normal", "airy"]) ||
      !Array.isArray(value.blocks) ||
      value.blocks.length < 1 ||
      value.blocks.length > 60
    )
      return false;
    const ids = new Set<string>(),
      singletons = new Set<string>();
    for (const block of value.blocks) {
      if (
        !closed(block, ["id", "type", "props"]) ||
        typeof block.id !== "string" ||
        !/^[a-z0-9-]{1,40}$/.test(block.id) ||
        ids.has(block.id) ||
        typeof block.type !== "string" ||
        !own(PROP_RULES, block.type) ||
        !object(block.props)
      )
        return false;
      ids.add(block.id);
      if (block.type === "line_items" || block.type === "totals") {
        if (singletons.has(block.type)) return false;
        singletons.add(block.type);
      }
      const rules = PROP_RULES[block.type as BlockType];
      for (const [key, v] of Object.entries(block.props)) {
        if (!own(rules, key)) return false;
        const rule = rules[key]!;
        if (rule === "boolean") {
          if (typeof v !== "boolean") return false;
        } else if (typeof rule === "number") {
          if (typeof v !== "string" || length(v) > rule || !validText(v))
            return false;
        } else if (Array.isArray(rule)) {
          if (!rule.includes(v as never)) return false;
        } else {
          const allowed = (rule as { array: readonly string[] }).array;
          if (
            !Array.isArray(v) ||
            v.length < 1 ||
            v.length > allowed.length ||
            new Set(v).size !== v.length ||
            v.some((x) => typeof x !== "string" || !allowed.includes(x))
          )
            return false;
        }
      }
    }
    return (
      new TextEncoder().encode(JSON.stringify(normalized(value))).byteLength <=
      65536
    );
  } catch {
    return false;
  }
}
export function parseLayout(value: unknown): Layout {
  if (!layoutIsValid(value)) throw new Error("studio_layout_invalid");
  return structuredClone(value);
}
export function brandIsValid(value: unknown): value is Brand {
  return (
    closed(value, [
      "primary",
      "accent",
      "font",
      "logo_asset_id",
      "footer_line",
      "registration_line",
    ]) &&
    Object.keys(value).length === 6 &&
    typeof value.primary === "string" &&
    /^#[0-9a-f]{6}$/.test(value.primary) &&
    typeof value.accent === "string" &&
    /^#[0-9a-f]{6}$/.test(value.accent) &&
    oneOf(value.font, ["sans", "serif", "mono-accent"]) &&
    (value.logo_asset_id === null ||
      (typeof value.logo_asset_id === "string" &&
        /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(
          value.logo_asset_id,
        ))) &&
    typeof value.footer_line === "string" &&
    length(value.footer_line) <= 200 &&
    validText(value.footer_line) &&
    typeof value.registration_line === "string" &&
    length(value.registration_line) <= 200 &&
    validText(value.registration_line)
  );
}
