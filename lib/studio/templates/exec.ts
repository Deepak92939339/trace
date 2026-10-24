import type { Layout } from "../layout-schema.ts";

export const exec = {
  "v": 1,
  "page": {
    "size": "A4",
    "margin": "wide"
  },
  "style": {
    "corners": "sharp",
    "rules": "hairline",
    "density": "airy"
  },
  "blocks": [
    {
      "id": "b-cover",
      "type": "cover",
      "props": {
        "title": "{{quote.title}}",
        "subtitle": "Prepared for {{customer.name}} · {{customer.contact}}",
        "abstract": "Revision {{quote.rev}} · issued {{quote.date}} · valid until {{quote.valid_until}}.",
        "meta": "columns",
        "tone": "light"
      }
    },
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
        "layout": "table",
        "showNotes": true
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
