import type { Layout } from "../layout-schema.ts";

export const showcase = {
  v: 1,
  page: {
    size: "A4",
    margin: "normal",
  },
  style: {
    corners: "sharp",
    rules: "hairline",
    density: "airy",
  },
  blocks: [
    {
      id: "b-letterhead",
      type: "letterhead",
      props: {
        align: "split",
        showAddress: true,
        showContact: true,
        variant: "plain",
      },
    },
    {
      id: "b-quote-meta",
      type: "quote_meta",
      props: {
        fields: ["number", "revision", "date", "valid_until", "currency"],
        direction: "row",
        labels: true,
      },
    },
    {
      id: "b-line-items",
      type: "line_items",
      props: {
        columns: ["sku", "description", "qty", "unit", "rate", "amount"],
        zebra: false,
        boxed: false,
        specs: true,
      },
    },
    {
      id: "b-extra-charges",
      type: "extra_charges",
      props: {},
    },
    {
      id: "b-totals",
      type: "totals",
      props: {
        layout: "right",
        showExtras: true,
      },
    },
    {
      id: "b-notes",
      type: "notes",
      props: {
        text: "Refer to the line items above.",
      },
    },
    {
      id: "b-acceptance",
      type: "acceptance",
      props: {
        text: "Use the secure buyer link to record your decision against {{quote.number}} · {{quote.rev}}.",
        showExpiry: true,
      },
    },
    {
      id: "b-footer",
      type: "footer",
      props: {
        text: "{{seller.name}} · {{seller.tax_id}}",
        right: "",
        rule: true,
        pageNumbers: "x_of_y",
      },
    },
  ],
} as const satisfies Layout;
