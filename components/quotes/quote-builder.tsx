"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  refreshQuoteLineAction,
  runQuoteWorkflowAction,
  saveQuoteDraftAction,
  type QuoteDraftProjection,
} from "@/app/(application)/quotes/actions";
import {
  calculateQuote,
  type ChargeType,
  type QuoteCalculationInput,
  type TaxPriceBasis,
  type TaxTreatment,
  type UnitCode,
} from "@/lib/quotes/calculate";
import { quoteStateLabel, type QuoteState } from "@/lib/quotes/effective-state";
import {
  formatMinor,
  formatMinorDecimal,
  parseDecimalMinor,
} from "@/lib/formatting/money";
import styles from "./quote-builder.module.css";
import { ConflictBanner, ExpiredNotice } from "@/components/states";
import {
  BuilderHeader,
  ChargesSection,
  DecisionActions,
  DiscountPolicyMeter,
  DocumentPreview,
  LineGrid,
  MarginMeter,
  PaymentScheduleEditor,
  RejectDialog,
  SaveState,
  SubmissionSnapshot,
  TermsStrip,
  TotalsList,
} from "./builder";
import {
  allocateMilestoneAmounts,
  validatePaymentMilestones,
  type PaymentMilestoneInput,
} from "@/lib/quotes/payment-schedule";
import { formatBasisPoints } from "@/lib/formatting/basis-points";
import {
  getDraftMargin,
  type DraftMargin,
} from "@/app/(application)/quotes/[number]/draft-margin";

type Customer = { id: string; name: string; taxTreatment: TaxTreatment };
type Product = {
  id: string;
  sku: string;
  description: string;
  unitCode: UnitCode;
  quantityPrecision: number;
  unitPriceMinor: number;
  currencyCode: string;
  taxCode: string;
  taxBps: number;
  taxTreatment: TaxTreatment;
};
type TaxProfile = {
  id: string;
  code: string;
  label: string;
  rateBps: number;
  treatment: TaxTreatment;
};
type LineState = {
  key: string;
  lineId: string | null;
  product: Product;
  quantity: string;
};
type ChargeState = {
  key: string;
  chargeId: string | null;
  chargeType: ChargeType;
  description: string;
  amount: string;
  taxProfileId: string;
  taxCode: string;
  taxBps: number;
  taxTreatment: TaxTreatment;
  discountApplies: boolean;
};

export type QuoteBuilderProps = {
  quote: {
    id: string;
    number: string;
    state: QuoteState;
    version: number;
    customerId: string;
    currencyCode: string;
    locale: string;
    taxLabel: string;
    taxMode: TaxPriceBasis;
    discountBps: number;
    issueDate: string;
    validUntil: string;
    notes: string;
    subtotalMinor: number;
    discountMinor: number;
    taxMinor: number;
    chargesMinor: number;
    chargeNetMinor?: number;
    totalMinor: number;
    customerSnapshot?: {
      name: string;
      contactName: string;
      email: string;
      addressLine1: string;
      addressLine2: string;
      city: string;
      region: string;
      postalCode: string;
      countryCode: string;
      taxIdentifier: string | null;
      approvalThresholdBps: number;
    };
  };
  customers: Customer[];
  products: Product[];
  taxProfiles: TaxProfile[];
  capabilities: string[];
  approvalThresholdBps?: number;
  previewSeller: { name: string; addressLines: string[] };
  initialLines: Array<{
    id: string;
    product: Product;
    quantityScaled: number;
    quantityScale: number;
  }>;
  initialCharges: Array<{
    id: string;
    chargeType: ChargeType;
    description: string;
    amountMinor: number;
    taxProfileId: string;
    taxCode: string;
    taxBps: number;
    taxTreatment: TaxTreatment;
    discountApplies: boolean;
  }>;
  canReadMargin?: boolean;
  initialMargin?: DraftMargin | null;
  initialSchedule?: PaymentMilestoneInput[];
  /** Download link for the issued revision's PDF (see PdfDownload). */
  pdfDownload?: {
    href: string;
    available: boolean;
    canGenerate: boolean;
  } | null;
};

function quantityText(scaled: number, scale: number) {
  if (scale === 1) return String(scaled);
  const precision = Math.round(Math.log10(scale));
  return `${Math.floor(scaled / scale)}.${String(scaled % scale).padStart(precision, "0")}`.replace(
    /\.?0+$/,
    "",
  );
}

function parseQuantity(value: string, precision: number) {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const [whole = "0", fraction = ""] = value.trim().split(".");
  if (fraction.length > precision) return null;
  const scale = 10 ** precision;
  const scaled =
    BigInt(whole) * BigInt(scale) +
    BigInt(fraction.padEnd(precision, "0") || "0");
  return scaled > 0n && scaled <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(scaled)
    : null;
}

function draftSignature(value: {
  customerId: string;
  currencyCode: string;
  locale: string;
  taxLabel: string;
  taxMode: TaxPriceBasis;
  discountBps: number;
  issueDate: string;
  validUntil: string;
  notes: string;
  lines: LineState[];
  charges: ChargeState[];
}) {
  return JSON.stringify(value);
}

export function QuoteBuilder({
  quote,
  customers,
  products,
  taxProfiles,
  capabilities,
  approvalThresholdBps = 1000,
  previewSeller,
  initialLines,
  initialCharges,
  canReadMargin,
  initialMargin,
  initialSchedule,
  pdfDownload,
}: QuoteBuilderProps) {
  const router = useRouter();
  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const taxById = useMemo(
    () => new Map(taxProfiles.map((tax) => [tax.id, tax])),
    [taxProfiles],
  );
  const [customerId, setCustomerId] = useState(quote.customerId);
  const [currencyCode, setCurrencyCode] = useState(quote.currencyCode);
  const [locale, setLocale] = useState(quote.locale);
  const [taxLabel, setTaxLabel] = useState(quote.taxLabel);
  const [taxMode, setTaxMode] = useState<TaxPriceBasis>(quote.taxMode);
  const [discountBps, setDiscountBps] = useState(quote.discountBps);
  const [issueDate, setIssueDate] = useState(quote.issueDate);
  const [validUntil, setValidUntil] = useState(quote.validUntil);
  const [notes, setNotes] = useState(quote.notes);
  const [selectedProduct, setSelectedProduct] = useState(products[0]?.id ?? "");
  const [lines, setLines] = useState<LineState[]>(
    initialLines.map((line) => ({
      key: line.id,
      lineId: line.id,
      product: line.product,
      quantity: quantityText(line.quantityScaled, line.quantityScale),
    })),
  );
  const [charges, setCharges] = useState<ChargeState[]>(
    initialCharges.map((charge) => ({
      key: charge.id,
      chargeId: charge.id,
      chargeType: charge.chargeType,
      description: charge.description,
      amount: formatMinorDecimal(charge.amountMinor, quote.currencyCode),
      taxProfileId: charge.taxProfileId,
      taxCode: charge.taxCode,
      taxBps: charge.taxBps,
      taxTreatment: charge.taxTreatment,
      discountApplies: charge.discountApplies,
    })),
  );
  const marginRequestRef = useRef(0);
  const [margin, setMargin] = useState<DraftMargin | null>(
    initialMargin ?? null,
  );
  const [saveState, setSaveState] = useState<
    "Saved" | "Unsaved" | "Saving…" | "Save failed"
  >("Saved");
  const [saveMessage, setSaveMessage] = useState("Saved server state loaded.");
  const [serverTotals, setServerTotals] = useState({
    subtotalMinor: quote.subtotalMinor,
    discountMinor: quote.discountMinor,
    taxMinor: quote.taxMinor,
    chargesMinor: quote.chargesMinor,
    chargeNetMinor: quote.chargeNetMinor,
    totalMinor: quote.totalMinor,
  });
  const versionRef = useRef(quote.version);
  const [quoteVersion, setQuoteVersion] = useState(quote.version);
  const [draftSchedule, setDraftSchedule] = useState<PaymentMilestoneInput[]>(
    initialSchedule ?? [],
  );
  const handleScheduleChange = useCallback(
    (milestones: PaymentMilestoneInput[]) => {
      setDraftSchedule(milestones);
    },
    [],
  );
  const handleScheduleVersionBump = useCallback((newVersion: number) => {
    versionRef.current = newVersion;
    setQuoteVersion(newVersion);
  }, []);
  const savingRef = useRef(false);
  const [queuedSave, setQueuedSave] = useState(0);
  const [staleConflict, setStaleConflict] = useState(false);
  const [refreshingLineId, setRefreshingLineId] = useState<string | null>(null);
  const [workflowMessage, setWorkflowMessage] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const rejectDialogRef = useRef<HTMLDialogElement>(null);
  const rejectButtonRef = useRef<HTMLButtonElement>(null);
  const rejectReasonRef = useRef<HTMLTextAreaElement>(null);
  const editable =
    quote.state === "draft" && capabilities.includes("quote.edit");

  const customerTreatment =
    customers.find((customer) => customer.id === customerId)?.taxTreatment ??
    "standard";
  const prepared = useMemo(() => {
    try {
      const items = lines.map((line, index) => {
        const product = line.product;
        const quantityScaled = parseQuantity(
          line.quantity,
          product.quantityPrecision,
        );
        if (!quantityScaled)
          throw new Error(
            `Line ${index + 1} quantity must be positive with at most ${product.quantityPrecision} decimals.`,
          );
        return {
          position: index + 1,
          product_id: product.id,
          sku_snapshot: product.sku,
          description_snapshot: product.description,
          unit_code_snapshot: product.unitCode,
          quantity_precision_snapshot: product.quantityPrecision,
          unit_price_minor_snapshot: product.unitPriceMinor,
          currency_code: product.currencyCode,
          quantity_scaled: quantityScaled,
          quantity_scale: 10 ** product.quantityPrecision,
          tax_code_snapshot: product.taxCode,
          tax_bps_snapshot: product.taxBps,
          tax_price_basis_snapshot: taxMode,
          tax_treatment_snapshot: line.lineId
            ? product.taxTreatment
            : customerTreatment === "standard"
              ? product.taxTreatment
              : customerTreatment,
        };
      });
      const preparedCharges = charges.map((charge, index) => {
        const tax = taxById.get(charge.taxProfileId);
        const amountMinor = parseDecimalMinor(charge.amount, currencyCode);
        if (!tax || amountMinor === null || !charge.description.trim())
          throw new Error(
            `Charge ${index + 1} needs a description, valid amount and tax profile.`,
          );
        const taxCode = charge.chargeId ? charge.taxCode : tax.code;
        const taxBps = charge.chargeId ? charge.taxBps : tax.rateBps;
        const taxTreatment = charge.chargeId
          ? charge.taxTreatment
          : customerTreatment === "standard"
            ? tax.treatment
            : customerTreatment;
        return {
          position: index + 1,
          charge_type: charge.chargeType,
          description_snapshot: charge.description.trim(),
          amount_minor: amountMinor,
          currency_code: currencyCode,
          tax_code_snapshot: taxCode,
          tax_bps_snapshot: taxBps,
          tax_price_basis_snapshot: taxMode,
          tax_treatment_snapshot: taxTreatment,
          discount_applies: charge.discountApplies,
        };
      });
      const calculationInput: QuoteCalculationInput = {
        currency_code: currencyCode,
        tax_mode: taxMode,
        discount_bps: discountBps,
        items,
        charges: preparedCharges,
      };
      const calculation = calculateQuote(calculationInput);
      const payload = {
        customer_id: customerId,
        currency_code: currencyCode,
        locale,
        tax_label: taxLabel,
        tax_mode: taxMode,
        discount_bps: discountBps,
        issue_date: issueDate,
        valid_until: validUntil,
        notes,
        items: items.map((item, index) => ({
          line_id: lines[index]!.lineId,
          product_id: item.product_id,
          position: item.position,
          quantity_scaled: item.quantity_scaled,
          quantity_scale: item.quantity_scale,
        })),
        charges: preparedCharges.map((charge, index) => ({
          charge_id: charges[index]!.chargeId,
          position: charge.position,
          charge_type: charge.charge_type,
          description: charge.description_snapshot,
          amount_minor: charge.amount_minor,
          tax_profile_id: charges[index]!.taxProfileId,
          discount_applies: charge.discount_applies,
        })),
      };
      return { calculation, payload, error: "" };
    } catch (error) {
      return {
        calculation: null,
        payload: null,
        error:
          error instanceof Error
            ? error.message
            : "Commercial fields are invalid.",
      };
    }
  }, [
    charges,
    currencyCode,
    customerId,
    customerTreatment,
    discountBps,
    issueDate,
    lines,
    locale,
    notes,
    taxById,
    taxLabel,
    taxMode,
    validUntil,
  ]);

  const signature = useMemo(
    () =>
      draftSignature({
        customerId,
        currencyCode,
        locale,
        taxLabel,
        taxMode,
        discountBps,
        issueDate,
        validUntil,
        notes,
        lines,
        charges,
      }),
    [
      charges,
      currencyCode,
      customerId,
      discountBps,
      issueDate,
      lines,
      locale,
      notes,
      taxLabel,
      taxMode,
      validUntil,
    ],
  );
  const baselineRef = useRef(signature);
  const latestSignatureRef = useRef(signature);
  useEffect(() => {
    latestSignatureRef.current = signature;
  }, [signature]);

  const projectionState = useCallback(
    (
      projection: QuoteDraftProjection,
      identity?: { lineKeys: string[]; chargeKeys: string[] },
    ) => {
      const projectedLines: LineState[] = projection.items.map(
        (item, index) => ({
          key: identity?.lineKeys[index] ?? item.id,
          lineId: item.id,
          quantity: quantityText(item.quantity_scaled, item.quantity_scale),
          product: {
            id: item.product_id ?? item.id,
            sku: item.sku_snapshot,
            description: item.description_snapshot,
            unitCode: item.unit_code_snapshot,
            quantityPrecision: item.quantity_precision_snapshot,
            unitPriceMinor: item.unit_price_minor_snapshot,
            currencyCode: item.currency_code,
            taxCode: item.tax_code_snapshot,
            taxBps: item.tax_bps_snapshot,
            taxTreatment: item.tax_treatment_snapshot,
          },
        }),
      );
      const projectedCharges: ChargeState[] = projection.charges.map(
        (charge, index) => ({
          key: identity?.chargeKeys[index] ?? charge.id,
          chargeId: charge.id,
          chargeType: charge.charge_type,
          description: charge.description_snapshot,
          amount: formatMinorDecimal(
            charge.amount_minor,
            projection.currency_code,
          ),
          taxProfileId:
            taxProfiles.find((tax) => tax.code === charge.tax_code_snapshot)
              ?.id ??
            taxProfiles[0]?.id ??
            "",
          taxCode: charge.tax_code_snapshot,
          taxBps: charge.tax_bps_snapshot,
          taxTreatment: charge.tax_treatment_snapshot,
          discountApplies: charge.discount_applies,
        }),
      );
      const state = {
        customerId: projection.customer_id,
        currencyCode: projection.currency_code,
        locale: projection.locale,
        taxLabel: projection.tax_label,
        taxMode: projection.tax_mode,
        discountBps: projection.discount_bps,
        issueDate: projection.issue_date,
        validUntil: projection.valid_until,
        notes: projection.notes,
        lines: projectedLines,
        charges: projectedCharges,
      };
      return { ...state, signature: draftSignature(state) };
    },
    [taxProfiles],
  );

  const applyExactProjection = useCallback(
    (
      projection: QuoteDraftProjection,
      message: string,
      identity?: { lineKeys: string[]; chargeKeys: string[] },
    ) => {
      const projected = projectionState(projection, identity);
      versionRef.current = projection.version;
      setQuoteVersion(projection.version);
      setCustomerId(projected.customerId);
      setCurrencyCode(projected.currencyCode);
      setLocale(projected.locale);
      setTaxLabel(projected.taxLabel);
      setTaxMode(projected.taxMode);
      setDiscountBps(projected.discountBps);
      setIssueDate(projected.issueDate);
      setValidUntil(projected.validUntil);
      setNotes(projected.notes);
      setLines(projected.lines);
      setCharges(projected.charges);
      setServerTotals({
        subtotalMinor: projection.subtotal_minor,
        discountMinor: projection.discount_minor,
        taxMinor: projection.tax_minor,
        chargesMinor: projection.charges_minor,
        chargeNetMinor: undefined, // projection has no net field; presentTotals derives it
        totalMinor: projection.total_minor,
      });
      baselineRef.current = projected.signature;
      latestSignatureRef.current = projected.signature;
      setStaleConflict(false);
      setSaveState("Saved");
      setSaveMessage(message);
      if (canReadMargin) {
        const requestId = ++marginRequestRef.current;
        getDraftMargin(quote.id)
          .then((nextMargin) => {
            // Ignore out-of-order responses from earlier saves.
            if (requestId === marginRequestRef.current) setMargin(nextMargin);
          })
          .catch(() => {
            // Keep the last known margin; the save itself succeeded.
          });
      }
    },
    [projectionState, canReadMargin, quote.id],
  );

  const persist = useCallback(
    async (
      capturedSignature: string,
      payload: unknown,
      capturedIdentity: { lineKeys: string[]; chargeKeys: string[] },
    ) => {
      if (savingRef.current) {
        setQueuedSave((value) => value + 1);
        return;
      }
      savingRef.current = true;
      setSaveState("Saving…");
      setSaveMessage("Saving authoritative draft…");
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
      const result = await saveQuoteDraftAction({
        quoteId: quote.id,
        expectedVersion: versionRef.current,
        commandId: crypto.randomUUID(),
        payload,
      });
      savingRef.current = false;
      if (result.status === "saved" && result.projection) {
        const projected = projectionState(result.projection, capturedIdentity);
        versionRef.current = result.projection.version;
        setQuoteVersion(result.projection.version);
        setServerTotals({
          subtotalMinor: result.projection.subtotal_minor,
          discountMinor: result.projection.discount_minor,
          taxMinor: result.projection.tax_minor,
          chargesMinor: result.projection.charges_minor,
          chargeNetMinor: undefined, // projection has no net field; presentTotals derives it
          totalMinor: result.projection.total_minor,
        });
        baselineRef.current = projected.signature;
        setStaleConflict(false);
        if (latestSignatureRef.current === capturedSignature) {
          applyExactProjection(
            result.projection,
            result.message,
            capturedIdentity,
          );
        } else {
          const projectedLineByKey = new Map(
            capturedIdentity.lineKeys.map((key, index) => [
              key,
              projected.lines[index],
            ]),
          );
          const projectedChargeByKey = new Map(
            capturedIdentity.chargeKeys.map((key, index) => [
              key,
              projected.charges[index],
            ]),
          );
          setLines((current) =>
            current.map((line) => {
              const serverLine = projectedLineByKey.get(line.key);
              return serverLine
                ? {
                    ...line,
                    lineId: serverLine.lineId,
                    product: serverLine.product,
                  }
                : line;
            }),
          );
          setCharges((current) =>
            current.map((charge) => {
              const serverCharge = projectedChargeByKey.get(charge.key);
              return serverCharge
                ? {
                    ...charge,
                    chargeId: serverCharge.chargeId,
                    taxProfileId: serverCharge.taxProfileId,
                    taxCode: serverCharge.taxCode,
                    taxBps: serverCharge.taxBps,
                    taxTreatment: serverCharge.taxTreatment,
                  }
                : charge;
            }),
          );
          setSaveState("Unsaved");
          setSaveMessage(
            "Server state reconciled; newer local edits are waiting to save.",
          );
          setQueuedSave((value) => value + 1);
        }
      } else {
        setStaleConflict(result.status === "stale");
        setSaveState("Save failed");
        setSaveMessage(result.message);
      }
    },
    [applyExactProjection, projectionState, quote.id],
  );

  useEffect(() => {
    if (!editable) return;
    if (signature === baselineRef.current) {
      if (!savingRef.current) {
        setSaveState("Saved");
        setSaveMessage("Saved server state unchanged.");
      }
      return;
    }
    setSaveState((current) => (current === "Saving…" ? current : "Unsaved"));
    setSaveMessage((current) =>
      current.includes("another session")
        ? current
        : "Changes are waiting to save.",
    );
    const timer = window.setTimeout(() => {
      if (prepared.payload) {
        void persist(signature, prepared.payload, {
          lineKeys: lines.map((line) => line.key),
          chargeKeys: charges.map((charge) => charge.key),
        });
      } else {
        setSaveState("Save failed");
        setSaveMessage(prepared.error);
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    charges,
    editable,
    lines,
    persist,
    prepared.error,
    prepared.payload,
    queuedSave,
    signature,
  ]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === "Unsaved" || saveState === "Save failed")
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  function saveNow() {
    if (!editable) return;
    if (prepared.payload) {
      void persist(signature, prepared.payload, {
        lineKeys: lines.map((line) => line.key),
        chargeKeys: charges.map((charge) => charge.key),
      });
    } else {
      setSaveState("Save failed");
      setSaveMessage(prepared.error);
    }
  }
  function addProduct() {
    const product = productsById.get(selectedProduct);
    if (!product) return;
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        lineId: null,
        product,
        quantity: product.quantityPrecision
          ? `1.${"0".repeat(product.quantityPrecision)}`
          : "1",
      },
    ]);
  }
  function addCharge() {
    const tax = taxProfiles[0];
    if (!tax) return;
    setCharges((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        chargeId: null,
        chargeType: "freight",
        description: "Freight",
        amount: formatMinorDecimal(0, currencyCode),
        taxProfileId: tax.id,
        taxCode: tax.code,
        taxBps: tax.rateBps,
        taxTreatment: tax.treatment,
        discountApplies: false,
      },
    ]);
  }
  const displayTotals = prepared.calculation ?? {
    ...serverTotals,
    subtotal_minor: serverTotals.subtotalMinor,
    discount_minor: serverTotals.discountMinor,
    tax_minor: serverTotals.taxMinor,
    charges_minor: serverTotals.chargesMinor,
    charge_net_minor: serverTotals.chargeNetMinor,
    total_minor: serverTotals.totalMinor,
  };

  async function refreshLine(lineId: string) {
    if (saveState !== "Saved") {
      setSaveMessage(
        "Save or reconcile local edits before refreshing catalog pricing.",
      );
      return;
    }
    setRefreshingLineId(lineId);
    setSaveState("Saving…");
    setSaveMessage("Refreshing this line from the current catalog…");
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
    const result = await refreshQuoteLineAction({
      quoteId: quote.id,
      lineId,
      expectedVersion: versionRef.current,
      commandId: crypto.randomUUID(),
    });
    setRefreshingLineId(null);
    if (result.status === "saved" && result.projection) {
      applyExactProjection(result.projection, result.message);
      setWorkflowMessage(result.message);
      router.refresh();
    } else {
      setStaleConflict(result.status === "stale");
      setSaveState("Save failed");
      setSaveMessage(result.message);
    }
  }

  async function runWorkflow(
    action: "submit" | "approve" | "reject" | "issue",
    reason?: string,
  ) {
    setWorkflowBusy(true);
    setWorkflowMessage(
      `${action[0]!.toUpperCase()}${action.slice(1)} in progress…`,
    );
    const result = await runQuoteWorkflowAction({
      quoteId: quote.id,
      expectedVersion: versionRef.current,
      commandId: crypto.randomUUID(),
      action,
      reason,
    });
    setWorkflowBusy(false);
    setWorkflowMessage(result.message);
    if (result.status === "ok") {
      if (result.version) versionRef.current = result.version;
      rejectDialogRef.current?.close();
      router.refresh();
    }
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNow();
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter" &&
        quote.state === "draft" &&
        capabilities.includes("quote.submit") &&
        saveState === "Saved" &&
        lines.length > 0
      ) {
        event.preventDefault();
        void runWorkflow("submit");
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  function openRejectDialog() {
    rejectDialogRef.current?.showModal();
    window.setTimeout(() => rejectReasonRef.current?.focus(), 0);
  }

  const stateLabel = quoteStateLabel(quote.state);
  const effectiveThresholdBps =
    quote.customerSnapshot?.approvalThresholdBps ?? approvalThresholdBps;

  const mathLines = useMemo(() => {
    if (!prepared.calculation) return [];
    return prepared.calculation.items.map((item, index) => {
      const qty = (item.quantity_scaled / item.quantity_scale).toLocaleString(
        locale,
        {
          maximumFractionDigits: item.quantity_precision_snapshot,
        },
      );
      const unitPrice = formatMinor(
        item.unit_price_minor_snapshot,
        currencyCode,
        locale,
      );
      return {
        key: `math-item-${item.product_id}-${index}`,
        label: item.description_snapshot,
        detail: `${qty} ${item.unit_code_snapshot} × ${unitPrice}`,
        amountMinor: item.base_minor,
      };
    });
  }, [prepared.calculation, locale, currencyCode]);

  const mathAdjustments = useMemo(() => {
    if (!prepared.calculation) return [];
    const adjustments = [];
    if (prepared.calculation.discount_minor > 0) {
      adjustments.push({
        key: "discount",
        label: `Discount ${(discountBps / 100).toFixed(2)}%`,
        amountMinor: -prepared.calculation.discount_minor,
      });
    }
    if (prepared.calculation.tax_minor > 0) {
      adjustments.push({
        key: "tax",
        label: taxLabel ? `${taxLabel} (${taxMode})` : "Tax",
        amountMinor: prepared.calculation.tax_minor,
      });
    }
    if (prepared.calculation.charges.length > 0) {
      for (const charge of prepared.calculation.charges) {
        adjustments.push({
          key: `charge-${charge.position}`,
          label: charge.description_snapshot,
          amountMinor: charge.net_minor,
        });
      }
    }
    return adjustments;
  }, [prepared.calculation, discountBps, taxLabel, taxMode]);

  const currentCustomer = customers.find((c) => c.id === customerId);
  const customerName = quote.customerSnapshot?.name ?? currentCustomer?.name;
  const customerContact = quote.customerSnapshot?.contactName;
  const customerAddress = quote.customerSnapshot
    ? [
        quote.customerSnapshot.addressLine1,
        quote.customerSnapshot.city,
        quote.customerSnapshot.countryCode,
      ]
        .filter(Boolean)
        .join(", ")
    : undefined;

  const previewLines = useMemo(() => {
    return lines.map((line, index) => {
      const calcItem = prepared.calculation?.items[index];
      return {
        key: line.key,
        sku: line.product.sku,
        description: line.product.description,
        quantity: line.quantity,
        unitCode: line.product.unitCode,
        unitPriceMinor: line.product.unitPriceMinor,
        amountMinor: calcItem ? calcItem.base_minor : undefined,
      };
    });
  }, [lines, prepared.calculation]);

  const previewCharges = useMemo(() => {
    return charges.map((charge, index) => {
      const calcCharge = prepared.calculation?.charges[index];
      return {
        key: charge.key,
        description: charge.description,
        amountMinor: calcCharge ? calcCharge.charge_total_minor : 0,
      };
    });
  }, [charges, prepared.calculation]);

  const previewPaymentSchedule = useMemo(() => {
    if (
      !draftSchedule ||
      draftSchedule.length === 0 ||
      validatePaymentMilestones(draftSchedule, issueDate) !== null
    ) {
      return undefined;
    }
    const totalBps = draftSchedule.reduce((sum, m) => sum + m.basis_points, 0);
    if (totalBps !== 10000) return undefined;
    const quoteTotal = prepared.calculation?.total_minor ?? quote.totalMinor;
    if (quoteTotal <= 0) return undefined;
    try {
      const allocated = allocateMilestoneAmounts(
        quoteTotal,
        draftSchedule.map((m) => m.basis_points),
      );
      return draftSchedule.map((m, i) => {
        let dueText = "";
        if (m.trigger === "on_acceptance") dueText = "Due on acceptance";
        else if (m.trigger === "on_delivery") dueText = "Due on delivery";
        else if (m.trigger === "on_completion") dueText = "Due on completion";
        else if (m.trigger === "on_date" && m.due_date)
          dueText = `Due on ${m.due_date}`;
        return {
          label: m.label,
          percentDisplay: formatBasisPoints(m.basis_points),
          amountDisplay: formatMinor(allocated[i]!, currencyCode, locale),
          dueText,
        };
      });
    } catch {
      return undefined;
    }
  }, [
    draftSchedule,
    issueDate,
    prepared.calculation,
    quote.totalMinor,
    currencyCode,
    locale,
  ]);

  return (
    <div className={`quote-builder ${styles.quoteBuilder}`}>
      <section
        className={`quote-document ${styles.workColumn}`}
        aria-labelledby="quote-number-heading"
      >
        <BuilderHeader quote={quote} stateLabel={stateLabel} />
        {quote.state === "expired" && (
          <ExpiredNotice
            tone="expired"
            title="This quotation has expired"
            body={`Validity ended on ${validUntil}. Create a new revision to quote again.`}
          />
        )}
        <SubmissionSnapshot customerSnapshot={quote.customerSnapshot} />

        <fieldset
          className={`quote-edit-fieldset ${styles.fieldset}`}
          disabled={!editable}
        >
          <TermsStrip
            customerId={customerId}
            customers={customers}
            issueDate={issueDate}
            validUntil={validUntil}
            currencyCode={currencyCode}
            locale={locale}
            taxLabel={taxLabel}
            taxMode={taxMode}
            discountBps={discountBps}
            onCustomerIdChange={(value) => setCustomerId(value)}
            onIssueDateChange={(value) => setIssueDate(value)}
            onValidUntilChange={(value) => setValidUntil(value)}
            onCurrencyCodeChange={(value) => setCurrencyCode(value)}
            onLocaleChange={(value) => setLocale(value)}
            onTaxLabelChange={(value) => setTaxLabel(value)}
            onTaxModeChange={(value) => setTaxMode(value)}
            onDiscountBpsChange={(value) =>
              setDiscountBps(
                Math.max(0, Math.min(10_000, Math.round(Number(value) * 100))),
              )
            }
          />

          <LineGrid
            lines={lines}
            products={products}
            selectedProduct={selectedProduct}
            calculatedItems={prepared.calculation?.items}
            currencyCode={currencyCode}
            locale={locale}
            saveState={saveState}
            refreshingLineId={refreshingLineId}
            onSelectedProductChange={(value) => setSelectedProduct(value)}
            onAddProduct={addProduct}
            onQuantityChange={(key, quantity) =>
              setLines((current) =>
                current.map((entry) =>
                  entry.key === key
                    ? {
                        ...entry,
                        quantity,
                      }
                    : entry,
                ),
              )
            }
            onRefreshLine={(lineId) => void refreshLine(lineId)}
            onRemoveLine={(key) =>
              setLines((current) =>
                current.filter((entry) => entry.key !== key),
              )
            }
          />

          <ChargesSection
            charges={charges}
            taxProfiles={taxProfiles}
            onAddCharge={addCharge}
            onChargeTypeChange={(key, chargeType) =>
              setCharges((current) =>
                current.map((entry) =>
                  entry.key === key
                    ? {
                        ...entry,
                        chargeType,
                      }
                    : entry,
                ),
              )
            }
            onChargeDescriptionChange={(key, description) =>
              setCharges((current) =>
                current.map((entry) =>
                  entry.key === key ? { ...entry, description } : entry,
                ),
              )
            }
            onChargeAmountChange={(key, amount) =>
              setCharges((current) =>
                current.map((entry) =>
                  entry.key === key ? { ...entry, amount } : entry,
                ),
              )
            }
            onChargeTaxProfileIdChange={(key, taxProfileId) =>
              setCharges((current) =>
                current.map((entry) =>
                  entry.key === key ? { ...entry, taxProfileId } : entry,
                ),
              )
            }
            onChargeDiscountAppliesChange={(key, discountApplies) =>
              setCharges((current) =>
                current.map((entry) =>
                  entry.key === key
                    ? {
                        ...entry,
                        discountApplies,
                      }
                    : entry,
                ),
              )
            }
            onRemoveCharge={(key) =>
              setCharges((current) =>
                current.filter((entry) => entry.key !== key),
              )
            }
          />

          <PaymentScheduleEditor
            quoteId={quote.id}
            expectedVersion={quoteVersion}
            issueDate={issueDate}
            totalMinor={displayTotals.total_minor}
            currencyCode={currencyCode}
            locale={locale}
            initialSchedule={initialSchedule}
            editable={editable}
            isDraftSaving={saveState === "Saving…"}
            isDraftDirty={saveState !== "Saved"}
            onVersionBump={handleScheduleVersionBump}
            onScheduleChange={handleScheduleChange}
          />

          <label className={`notes-field ${styles.notesField}`}>
            Commercial notes
            <textarea
              className={styles.notesTextarea}
              value={notes}
              maxLength={5000}
              rows={6}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </fieldset>

        <DocumentPreview
          quoteNumber={quote.number}
          issueDate={issueDate}
          validUntil={validUntil}
          customerName={customerName}
          customerContact={customerContact}
          customerAddress={customerAddress}
          lines={previewLines}
          charges={previewCharges}
          displayTotals={displayTotals}
          currencyCode={currencyCode}
          locale={locale}
          taxMode={taxMode}
          taxLabel={taxLabel}
          sellerName={previewSeller.name}
          sellerAddressLines={previewSeller.addressLines}
          paymentSchedule={previewPaymentSchedule}
        />

        {/* Sticky summary bar for <1180px */}
        <div className={styles.bottomSummaryBar} aria-hidden="true">
          <div className={styles.barTotal}>
            <span className={styles.barTotalLabel}>Total</span>
            <span className={styles.barTotalValue}>
              {formatMinor(displayTotals.total_minor, currencyCode, locale)}
            </span>
          </div>
          <div className={styles.barSaveState}>
            <span
              className={`${styles.barDot} ${
                saveState === "Saved"
                  ? styles.dotSaved
                  : saveState === "Unsaved"
                    ? styles.dotUnsaved
                    : saveState === "Saving…"
                      ? styles.dotSaving
                      : styles.dotSaveFailed
              }`}
            />
            <span>{saveState}</span>
          </div>
          <div className={styles.barAction}>
            {quote.state === "draft" &&
            capabilities.includes("quote.submit") ? (
              <button
                type="button"
                tabIndex={-1}
                className={styles.barButton}
                onClick={() => void runWorkflow("submit")}
                disabled={
                  workflowBusy || saveState !== "Saved" || lines.length === 0
                }
              >
                Submit for decision
              </button>
            ) : quote.state === "waiting" &&
              capabilities.includes("quote.approve") ? (
              <button
                type="button"
                tabIndex={-1}
                className={styles.barButton}
                onClick={() => void runWorkflow("approve")}
                disabled={workflowBusy}
              >
                Approve quote
              </button>
            ) : quote.state === "approved" &&
              capabilities.includes("quote.issue") ? (
              <button
                type="button"
                tabIndex={-1}
                className={styles.barButton}
                onClick={() => void runWorkflow("issue")}
                disabled={workflowBusy}
              >
                Issue quote
              </button>
            ) : quote.state === "issued" &&
              capabilities.includes("quote.print") ? (
              <button
                type="button"
                tabIndex={-1}
                className={styles.barButton}
                onClick={() => window.print()}
              >
                Print / Save PDF
              </button>
            ) : editable ? (
              <button
                type="button"
                tabIndex={-1}
                className={styles.barButton}
                onClick={saveNow}
                disabled={saveState === "Saving…"}
              >
                Save draft
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <aside
        className={`quote-summary ${styles.quoteSummary}`}
        aria-label="Quotation summary"
      >
        <TotalsList
          preparedError={prepared.error}
          displayTotals={displayTotals}
          currencyCode={currencyCode}
          locale={locale}
          taxMode={taxMode}
          customerTreatment={customerTreatment}
          mathLines={mathLines}
          mathAdjustments={mathAdjustments}
        />
        <DiscountPolicyMeter
          discountBps={discountBps}
          thresholdBps={effectiveThresholdBps}
        />
        {canReadMargin && quote.state === "draft" && (
          <MarginMeter margin={margin} />
        )}
        <SaveState
          saveState={saveState}
          saveMessage={saveMessage}
          staleConflict={false}
          onReloadServerState={() => {}}
        />
        {staleConflict && (
          <ConflictBanner
            title="Someone else saved this quote"
            body="Your changes were not saved. Reload to see the latest version, then make your change again."
            action={
              <button
                className="button"
                type="button"
                onClick={() => window.location.reload()}
              >
                Reload server state
              </button>
            }
          />
        )}
        <DecisionActions
          quote={quote}
          capabilities={capabilities}
          editable={editable}
          saveState={saveState}
          workflowBusy={workflowBusy}
          lines={lines}
          workflowMessage={workflowMessage}
          rejectButtonRef={rejectButtonRef}
          onSaveDraft={saveNow}
          onSubmitForDecision={() => void runWorkflow("submit")}
          onApproveQuote={() => void runWorkflow("approve")}
          onOpenRejectDialog={openRejectDialog}
          onIssueQuote={() => void runWorkflow("issue")}
          onPrintQuote={() => window.print()}
          pdfDownload={pdfDownload}
        />
        <p className={`legal-note ${styles.legalNote}`}>
          Server calculations, authorization and version are authoritative.
          Approved is not Issued; Issued does not mean Delivered.
        </p>
      </aside>
      <RejectDialog
        rejectDialogRef={rejectDialogRef}
        rejectReasonRef={rejectReasonRef}
        workflowBusy={workflowBusy}
        workflowMessage={workflowMessage}
        onClose={() => {
          setWorkflowMessage("");
          rejectButtonRef.current?.focus();
        }}
        onConfirmReject={(reason) => void runWorkflow("reject", reason)}
      />
    </div>
  );
}
