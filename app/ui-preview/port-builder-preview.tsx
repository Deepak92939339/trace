"use client";

import { useState } from "react";
import {
  QuoteBuilder,
  type QuoteBuilderProps,
} from "@/components/quotes/quote-builder";
import { calculateQuote } from "@/lib/quotes/calculate";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import shell from "@/components/application/app-shell.module.css";

// Fictional, development-only fixtures. All displayed totals use the real kernel.
const products: QuoteBuilderProps["products"] = [
  {
    id: "fixture-product-1",
    sku: "ST-304-12",
    description: "Stainless steel plate, 304 grade, 12 mm",
    unitCode: "EA",
    quantityPrecision: 0,
    unitPriceMinor: 42000,
    currencyCode: "USD",
    taxCode: "VAT10",
    taxBps: 1000,
    taxTreatment: "standard",
  },
  {
    id: "fixture-product-2",
    sku: "FAB-CUT",
    description: "Precision cutting and edge finishing",
    unitCode: "EA",
    quantityPrecision: 0,
    unitPriceMinor: 18500,
    currencyCode: "USD",
    taxCode: "VAT10",
    taxBps: 1000,
    taxTreatment: "standard",
  },
  {
    id: "fixture-product-3",
    sku: "BRKT-08",
    description: "Mounting bracket assembly",
    unitCode: "EA",
    quantityPrecision: 0,
    unitPriceMinor: 7900,
    currencyCode: "USD",
    taxCode: "VAT10",
    taxBps: 1000,
    taxTreatment: "standard",
  },
];
const initialLines = products.map((product, index) => ({
  id: `fixture-line-${index}`,
  product,
  quantityScaled: index === 0 ? 4 : 2,
  quantityScale: 1,
}));
const totals = calculateQuote({
  currency_code: "USD",
  tax_mode: "exclusive",
  discount_bps: 1200,
  charges: [],
  items: initialLines.map((line, index) => ({
    position: index + 1,
    product_id: line.product.id,
    sku_snapshot: line.product.sku,
    description_snapshot: line.product.description,
    unit_code_snapshot: line.product.unitCode,
    quantity_precision_snapshot: 0,
    unit_price_minor_snapshot: line.product.unitPriceMinor,
    currency_code: "USD",
    quantity_scaled: line.quantityScaled,
    quantity_scale: 1,
    tax_code_snapshot: "VAT10",
    tax_bps_snapshot: 1000,
    tax_price_basis_snapshot: "exclusive",
    tax_treatment_snapshot: "standard",
  })),
});
const fixture: QuoteBuilderProps = {
  quote: {
    id: "fixture-quote",
    number: "TRC-2026-0142",
    state: "draft",
    version: 3,
    customerId: "fixture-customer",
    currencyCode: "USD",
    locale: "en-US",
    taxLabel: "VAT",
    taxMode: "exclusive",
    discountBps: 1200,
    issueDate: "2026-10-22",
    validUntil: "2026-11-21",
    notes:
      "Delivery within 21 days of issue. Quantities and finish as specified.",
    subtotalMinor: totals.subtotal_minor,
    discountMinor: totals.discount_minor,
    taxMinor: totals.tax_minor,
    chargesMinor: totals.charges_minor,
    totalMinor: totals.total_minor,
    customerSnapshot: {
      name: "Asha Engineering Works — long customer name fixture",
      contactName: "Meera Kapoor",
      email: "commercial@example.invalid",
      addressLine1: "42 Industrial Estate",
      addressLine2: "",
      city: "Bristol",
      region: "",
      postalCode: "BS1 1AA",
      countryCode: "GB",
      taxIdentifier: null,
      approvalThresholdBps: 1000,
    },
  },
  customers: [
    {
      id: "fixture-customer",
      name: "Asha Engineering Works — long customer name fixture",
      taxTreatment: "standard",
    },
  ],
  products,
  taxProfiles: [
    {
      id: "fixture-vat",
      code: "VAT10",
      label: "VAT 10%",
      rateBps: 1000,
      treatment: "standard",
    },
  ],
  capabilities: [
    "quote.edit",
    "quote.submit",
    "quote.approve",
    "quote.issue",
    "quote.print",
  ],
  approvalThresholdBps: 1000,
  previewSeller: {
    name: "Northline Fabrication Ltd",
    addressLines: ["18 Foundry Lane", "Bristol BS2 0AA"],
  },
  initialLines,
  initialCharges: [],
  canReadMargin: true,
  initialMargin: {
    marginBps: 2780,
    floorBps: 1800,
    linesWithoutCost: 0,
    belowCost: false,
    underFloor: false,
  },
  initialSchedule: [
    {
      label: "On acceptance",
      basis_points: 3000,
      trigger: "on_acceptance",
      due_date: null,
    },
    {
      label: "On delivery",
      basis_points: 7000,
      trigger: "on_delivery",
      due_date: null,
    },
  ],
};

export function PortBuilderPreview() {
  const [scenario, setScenario] = useState("draft");
  return (
    <div className={shell.app}>
      <AppSidebar
        organizationName="Northline Fabrication Ltd"
        displayName="Commercial reviewer"
        roleLabel={scenario === "reviewer" ? "Read only" : "Manager"}
        signOutAction={() => {}}
      />
      <div className={shell.main}>
        <TopBar
          breadcrumbs={[
            { label: "Quotes", href: "/quotes" },
            { label: fixture.quote.number },
          ]}
          actions={
            <label>
              Fixture{" "}
              <select
                aria-label="Preview scenario"
                value={scenario}
                onChange={(event) => setScenario(event.target.value)}
              >
                <option value="draft">Draft / margin</option>
                <option value="waiting">Waiting / decision</option>
                <option value="reviewer">Read only / no margin</option>
              </select>
            </label>
          }
        />
        <main id="main-content" className={`app-main ${shell.appMain}`}>
          <QuoteBuilder
            key={scenario}
            {...fixture}
            quote={{
              ...fixture.quote,
              state: scenario === "draft" ? "draft" : "waiting",
            }}
            capabilities={scenario === "reviewer" ? [] : fixture.capabilities}
            canReadMargin={scenario !== "reviewer"}
          />
        </main>
      </div>
    </div>
  );
}
