import type { Layout } from "../layout-schema.ts";

export const compact = {
  v: 1,
  page: {
    size: "A4",
    margin: "narrow",
  },
  style: {
    corners: "sharp",
    rules: "hairline",
    density: "compact",
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
        labels: false,
      },
    },
    {
      id: "b-line-items",
      type: "line_items",
      props: {
        columns: ["description", "qty", "rate", "amount"],
        zebra: true,
        boxed: false,
        specs: false,
      },
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
      id: "b-acceptance",
      type: "acceptance",
      props: {
        text: "Use the secure buyer link to record your decision against {{quote.number}} · {{quote.rev}}.",
        showExpiry: true,
      },
    },
    {
      id: "b-terms",
      type: "terms",
      props: {
        text: "",
        columns: 2,
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
