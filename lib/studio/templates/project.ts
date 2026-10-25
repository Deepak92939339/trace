import type { Layout } from "../layout-schema.ts";

export const project = {
  "v": 1,
  "page": {
    "size": "A4",
    "margin": "normal"
  },
  "style": {
    "corners": "sharp",
    "rules": "hairline",
    "density": "normal"
  },
  "blocks": [
    {
      "id": "b-letterhead",
      "type": "letterhead",
      "props": {
        "align": "split",
        "showAddress": true,
        "showContact": true,
        "variant": "plain"
      }
    },
    {
      "id": "b-parties",
      "type": "parties",
      "props": {
        "layout": "two-col",
        "tint": true
      }
    },
    {
      "id": "b-intro",
      "type": "intro",
      "props": {
        "text": "{{quote.title}} — prepared for {{customer.name}}."
      }
    },
    {
      "id": "b-line-items",
      "type": "line_items",
      "props": {
        "columns": [
          "description",
          "qty",
          "unit",
          "rate",
          "amount"
        ],
        "zebra": false,
        "boxed": false,
        "specs": true
      }
    },
    {
      "id": "b-totals",
      "type": "totals",
      "props": {
        "layout": "right",
        "showExtras": true
      }
    },
    {
      "id": "b-payment-schedule",
      "type": "payment_schedule",
      "props": {
        "layout": "cards",
        "showNotes": true
      }
    },
    {
      "id": "b-terms",
      "type": "terms",
      "props": {
        "text": "",
        "columns": 1
      }
    },
    {
      "id": "b-acceptance",
      "type": "acceptance",
      "props": {
        "text": "Use the secure buyer link to record your decision against {{quote.number}} · {{quote.rev}}.",
        "showExpiry": true
      }
    },
    {
      "id": "b-footer",
      "type": "footer",
      "props": {
        "text": "{{seller.name}} · {{seller.tax_id}}",
        "right": "",
        "rule": true,
        "pageNumbers": "x_of_y"
      }
    }
  ]
} as const satisfies Layout;
