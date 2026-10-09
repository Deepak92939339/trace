import { notFound } from "next/navigation";
import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { HistoryTimeline } from "@/components/quotes/history-timeline";
import { IssuedPrintDocument } from "@/components/quotes/issued-print-document";
import { EmailActivityList } from "@/components/quotes/email-activity-list";
import { EmailToBuyerPanel } from "@/components/quotes/email-to-buyer-panel";
import { RecipientAccessPanel } from "@/components/quotes/recipient-access-panel";
import { RecipientCommitment } from "@/components/quotes/recipient-commitment";
import { getDraftMargin } from "./draft-margin";
import { requireApplicationContext } from "@/lib/auth/context";
import { effectiveQuoteState } from "@/lib/quotes/effective-state";
import {
  issuedActorForRevision,
  printPropsFromLegacyRows,
  printPropsFromRevision,
  verifiedSealedSnapshot,
  type IssuedPrintProps,
} from "@/lib/quotes/issued-print-props";
import {
  canCreateShareLink,
  defaultShareExpiry,
  exclusiveEndOfOrganizationDate,
  presentCommitmentEvents,
  presentShareLinks,
  SHARE_LINK_SELECT_COLUMNS,
  type AcceptanceRecord,
  type RecipientEventRecord,
  type ShareLinkRecord,
} from "@/lib/quotes/share-link";
import { createClient } from "@/lib/supabase/server";
import type { EmailActivityRow } from "@/lib/outbox/status";
import { type PaymentMilestoneInput } from "@/lib/quotes/payment-schedule";

export default async function QuotePage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const context = await requireApplicationContext();
  const { number } = await params;
  const supabase = await createClient();
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("organization_id", context.membership.organizationId)
    .eq("number", decodeURIComponent(number))
    .maybeSingle();
  if (error) throw new Error("Unable to load the tenant-scoped quotation.");
  if (!quote) notFound();
  const [
    customersResult,
    productsResult,
    taxResult,
    itemsResult,
    chargesResult,
    activityResult,
    revisionResult,
    shareLinksResult,
    recipientEventsResult,
    acceptancesResult,
  ] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, tax_treatment")
      .eq("organization_id", context.membership.organizationId)
      .or(`active.eq.true,id.eq.${quote.customer_id}`)
      .order("name"),
    supabase
      .from("products")
      .select(
        "id, sku, description, unit_code, quantity_precision, unit_price_minor, currency_code, tax_profiles!inner(code, rate_bps, treatment)",
      )
      .eq("organization_id", context.membership.organizationId)
      .eq("active", true)
      .order("sku"),
    supabase
      .from("tax_profiles")
      .select("id, code, label, rate_bps, treatment")
      .eq("organization_id", context.membership.organizationId)
      .eq("active", true)
      .order("code"),
    supabase
      .from("quote_items")
      .select(
        "id, position, product_id, sku_snapshot, description_snapshot, unit_code_snapshot, quantity_precision_snapshot, unit_price_minor_snapshot, currency_code, quantity_scaled, quantity_scale, tax_code_snapshot, tax_bps_snapshot, tax_price_basis_snapshot, tax_treatment_snapshot, line_total_minor",
      )
      .eq("organization_id", context.membership.organizationId)
      .eq("quote_id", quote.id)
      .order("position"),
    supabase
      .from("quote_charges")
      .select(
        "id, charge_type, description_snapshot, amount_minor, tax_code_snapshot, tax_bps_snapshot, tax_treatment_snapshot, tax_minor, charge_total_minor, discount_applies",
      )
      .eq("organization_id", context.membership.organizationId)
      .eq("quote_id", quote.id)
      .order("position"),
    supabase
      .from("quote_activity")
      .select(
        "id, event_type, actor_name_snapshot, actor_role_snapshot, actor_source, message, safe_metadata, created_at",
      )
      .eq("organization_id", context.membership.organizationId)
      .eq("quote_id", quote.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quote_revisions")
      .select(
        "id, revision_number, state, valid_until, payment_schedule:snapshot->payment_schedule",
      )
      .eq("organization_id", context.membership.organizationId)
      .eq("quote_id", quote.id)
      .order("revision_number", { ascending: false }),
    supabase
      .from("quote_share_links")
      .select(SHARE_LINK_SELECT_COLUMNS)
      .eq("organization_id", context.membership.organizationId)
      .eq("quote_id", quote.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quote_recipient_events")
      .select("id, event_type, message, created_at, revision_id, share_link_id")
      .eq("organization_id", context.membership.organizationId)
      .eq("quote_id", quote.id)
      .in("event_type", ["change_requested", "declined", "accepted"])
      .order("created_at", { ascending: false }),
    supabase
      .from("quote_acceptances")
      .select(
        "id, accepted_at, recipient_email_snapshot, buyer_asserted_name, buyer_asserted_title, acceptance_statement_version, acceptance_statement, revision_id, snapshot_hash, calculation_fingerprint, share_link_id",
      )
      .eq("organization_id", context.membership.organizationId)
      .eq("quote_id", quote.id)
      .order("accepted_at", { ascending: false }),
  ]);
  if (
    customersResult.error ||
    productsResult.error ||
    taxResult.error ||
    itemsResult.error ||
    chargesResult.error ||
    activityResult.error ||
    revisionResult.error ||
    shareLinksResult.error ||
    recipientEventsResult.error ||
    acceptancesResult.error
  )
    throw new Error("Unable to load quotation builder references.");
  const taxProfiles = taxResult.data ?? [];
  const effectiveState = effectiveQuoteState(
    quote.state,
    quote.valid_until,
    context.membership.organization.timezone,
  );
  const submitted =
    quote.state !== "draft" &&
    quote.customer_name_snapshot &&
    quote.approval_threshold_bps_snapshot !== null;
  const customers = (customersResult.data ?? []).map((customer) => ({
    id: customer.id,
    name:
      submitted && customer.id === quote.customer_id
        ? quote.customer_name_snapshot!
        : customer.name,
    taxTreatment:
      submitted && customer.id === quote.customer_id
        ? quote.customer_tax_treatment
        : customer.tax_treatment,
  }));
  const sellerSnapshot =
    quote.seller_legal_name_snapshot &&
    quote.seller_address_line1_snapshot &&
    quote.seller_city_snapshot &&
    quote.seller_country_code_snapshot
      ? {
          legalName: quote.seller_legal_name_snapshot,
          addressLine1: quote.seller_address_line1_snapshot,
          addressLine2: quote.seller_address_line2_snapshot,
          city: quote.seller_city_snapshot,
          region: quote.seller_region_snapshot,
          postalCode: quote.seller_postal_code_snapshot,
          countryCode: quote.seller_country_code_snapshot,
          taxIdentifier: quote.seller_tax_identifier_snapshot,
          contactEmail: quote.seller_contact_email_snapshot,
          contactPhone: quote.seller_contact_phone_snapshot,
        }
      : null;
  const currentRevision = (revisionResult.data ?? []).find(
    (revision) => revision.id === quote.current_revision_id,
  );
  const canShare =
    context.capabilities.includes("quote.share") &&
    canCreateShareLink({
      currentRevisionId: quote.current_revision_id,
      revisionId: currentRevision?.id,
      revisionState: currentRevision?.state,
    });
  const timezone = context.membership.organization.timezone;
  const validUntil = currentRevision?.valid_until ?? quote.valid_until;
  const maxExpires = exclusiveEndOfOrganizationDate(validUntil, timezone);
  const defaultExpires = defaultShareExpiry(validUntil, timezone);
  const shareLinks = presentShareLinks(
    (shareLinksResult.data ?? []) as ShareLinkRecord[],
  );
  const revisionNumbers = new Map(
    (revisionResult.data ?? []).map((revision) => [
      revision.id,
      revision.revision_number,
    ]),
  );
  const commitmentEvents = presentCommitmentEvents(
    (recipientEventsResult.data ?? []) as RecipientEventRecord[],
    (acceptancesResult.data ?? []) as AcceptanceRecord[],
    revisionNumbers,
  );
  const showCommitment =
    Boolean(quote.current_revision_id) &&
    (currentRevision?.state === "issued" || commitmentEvents.length > 0);
  const canReadMargin = context.capabilities.includes("margin.read");
  const initialMargin =
    quote.state === "draft" && canReadMargin
      ? await getDraftMargin(quote.id)
      : null;
  const draftScheduleResult =
    quote.state === "draft"
      ? await supabase
          .from("quote_payment_schedule_editor")
          .select("milestones")
          .eq("quote_id", quote.id)
          .maybeSingle()
      : null;
  const initialSchedule =
    quote.state === "draft"
      ? ((draftScheduleResult?.data?.milestones ??
          []) as PaymentMilestoneInput[])
      : Array.isArray(currentRevision?.payment_schedule)
        ? (currentRevision.payment_schedule as unknown as PaymentMilestoneInput[])
        : [];
  // Emails about this quotation. Internal addresses are never returned by this view.
  const { data: emailRows, error: emailError } = await supabase
    .from("quote_email_activity")
    .select(
      "id, kind, audience, recipient_label, display_status, attempts, max_attempts, created_at, sent_at, last_error_code",
    )
    .eq("organization_id", context.membership.organizationId)
    .eq("quote_id", quote.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (emailError) throw new Error("Unable to load the quotation emails.");
  const emails = (emailRows ?? []) as EmailActivityRow[];
  // The print document and the PDF share one source: the sealed snapshot of the current
  // issued revision, never the live quote tables (which a successor revision rewrites).
  let issuedPrint: IssuedPrintProps | null = null;
  let pdfDownload: {
    href: string;
    available: boolean;
    canGenerate: boolean;
  } | null = null;
  if (quote.state === "issued" && quote.issued_at) {
    const [sealedResult, pdfResult] = currentRevision
      ? await Promise.all([
          supabase
            .from("quote_revisions")
            .select("snapshot, snapshot_hash, issued_at")
            .eq("id", currentRevision.id)
            .maybeSingle(),
          supabase
            .from("quote_revision_pdfs")
            .select("revision_id")
            .eq("revision_id", currentRevision.id)
            .maybeSingle(),
        ])
      : [null, null];
    if (sealedResult?.error || pdfResult?.error)
      throw new Error("Unable to load the sealed quotation revision.");
    const sealed = sealedResult?.data;
    const activity = activityResult.data ?? [];
    if (currentRevision && sealed?.snapshot) {
      issuedPrint = printPropsFromRevision({
        snapshot: verifiedSealedSnapshot(sealed),
        issuedAt: sealed.issued_at ?? quote.issued_at,
        issuedActor: issuedActorForRevision(activity, currentRevision.id),
        timeZone: timezone,
      });
      pdfDownload = {
        href: `/quotes/${encodeURIComponent(quote.number)}/revisions/${currentRevision.revision_number}/pdf`,
        available: Boolean(pdfResult?.data),
        canGenerate: context.capabilities.includes("quote.print"),
      };
    } else {
      issuedPrint = printPropsFromLegacyRows({
        quote: { ...quote, issued_at: quote.issued_at },
        seller: sellerSnapshot,
        items: itemsResult.data ?? [],
        charges: (chargesResult.data ?? []).map((charge) => ({
          id: charge.id,
          description_snapshot: charge.description_snapshot,
          amount_minor: charge.amount_minor,
          tax_minor: charge.tax_minor,
          charge_total_minor: charge.charge_total_minor,
        })),
        issuedActor:
          activity.find(
            (row) =>
              row.event_type === "quote.issued" ||
              row.event_type === "quote.revision_issue",
          )?.actor_name_snapshot ?? "Trace user",
        timeZone: timezone,
      });
    }
  }
  return (
    <section className="quote-page">
      <QuoteBuilder
        pdfDownload={pdfDownload}
        key={`${quote.id}:${quote.version}`}
        canReadMargin={canReadMargin}
        initialMargin={initialMargin}
        initialSchedule={initialSchedule}
        previewSeller={
          sellerSnapshot
            ? {
                name: sellerSnapshot.legalName,
                addressLines: [
                  [sellerSnapshot.addressLine1, sellerSnapshot.addressLine2]
                    .filter(Boolean)
                    .join(", "),
                  [
                    sellerSnapshot.city,
                    sellerSnapshot.region,
                    sellerSnapshot.postalCode,
                    sellerSnapshot.countryCode,
                  ]
                    .filter(Boolean)
                    .join(", "),
                ],
              }
            : { name: context.membership.organization.name, addressLines: [] }
        }
        quote={{
          id: quote.id,
          number: quote.number,
          state: effectiveState,
          version: quote.version,
          customerId: quote.customer_id,
          currencyCode: quote.currency_code,
          locale: quote.locale,
          taxLabel: quote.tax_label,
          taxMode: quote.tax_mode,
          discountBps: quote.discount_bps,
          issueDate: quote.issue_date,
          validUntil: quote.valid_until,
          notes: quote.notes,
          subtotalMinor: quote.subtotal_minor,
          discountMinor: quote.discount_minor,
          taxMinor: quote.tax_minor ?? 0,
          chargesMinor: quote.charges_minor ?? 0,
          chargeNetMinor: quote.charge_net_minor,
          totalMinor: quote.total_minor,
          customerSnapshot: submitted
            ? {
                name: quote.customer_name_snapshot!,
                contactName: quote.contact_name_snapshot!,
                email: quote.email_snapshot!,
                addressLine1: quote.billing_address_line1_snapshot!,
                addressLine2: quote.billing_address_line2_snapshot!,
                city: quote.billing_city_snapshot!,
                region: quote.billing_region_snapshot!,
                postalCode: quote.billing_postal_code_snapshot!,
                countryCode: quote.billing_country_code_snapshot!,
                taxIdentifier: quote.tax_identifier_snapshot,
                approvalThresholdBps: quote.approval_threshold_bps_snapshot!,
              }
            : undefined,
        }}
        customers={customers}
        capabilities={context.capabilities}
        approvalThresholdBps={
          context.membership.organization.approval_threshold_bps
        }
        products={(productsResult.data ?? []).map((product) => {
          const tax = Array.isArray(product.tax_profiles)
            ? product.tax_profiles[0]!
            : product.tax_profiles;
          return {
            id: product.id,
            sku: product.sku,
            description: product.description,
            unitCode: product.unit_code,
            quantityPrecision: product.quantity_precision,
            unitPriceMinor: product.unit_price_minor,
            currencyCode: product.currency_code,
            taxCode: tax.code,
            taxBps: tax.rate_bps,
            taxTreatment: tax.treatment,
          };
        })}
        taxProfiles={taxProfiles.map((tax) => ({
          id: tax.id,
          code: tax.code,
          label: tax.label,
          rateBps: tax.rate_bps,
          treatment: tax.treatment,
        }))}
        initialLines={(itemsResult.data ?? []).map((item) => ({
          id: item.id,
          quantityScaled: item.quantity_scaled,
          quantityScale: item.quantity_scale,
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
        }))}
        initialCharges={(chargesResult.data ?? []).map((charge) => ({
          id: charge.id,
          chargeType: charge.charge_type,
          description: charge.description_snapshot,
          amountMinor: charge.amount_minor,
          taxProfileId:
            taxProfiles.find((tax) => tax.code === charge.tax_code_snapshot)
              ?.id ??
            taxProfiles[0]?.id ??
            "",
          taxCode: charge.tax_code_snapshot,
          taxBps: charge.tax_bps_snapshot,
          taxTreatment: charge.tax_treatment_snapshot,
          discountApplies: charge.discount_applies,
        }))}
      />
      {canShare && currentRevision && (
        <RecipientAccessPanel
          quoteId={quote.id}
          quoteVersion={quote.version}
          revisionId={currentRevision.id}
          revisionNumber={currentRevision.revision_number}
          timezone={timezone}
          locale={quote.locale}
          maxExpiresAt={maxExpires.toISOString()}
          defaultExpiresAt={(defaultExpires ?? maxExpires).toISOString()}
          links={shareLinks}
        />
      )}
      {canShare && currentRevision && (
        <EmailToBuyerPanel
          quoteId={quote.id}
          quoteVersion={quote.version}
          revisionId={currentRevision.id}
          revisionNumber={currentRevision.revision_number}
          timezone={timezone}
          maxExpiresAt={maxExpires.toISOString()}
          defaultExpiresAt={(defaultExpires ?? maxExpires).toISOString()}
        />
      )}
      {showCommitment && (
        <RecipientCommitment
          locale={quote.locale}
          timezone={timezone}
          events={commitmentEvents}
        />
      )}
      {(emails.length > 0 || quote.state === "issued") && (
        <EmailActivityList
          emails={emails}
          locale={quote.locale}
          timezone={timezone}
        />
      )}
      <section className="activity-section" aria-labelledby="activity-heading">
        <header>
          <p className="eyebrow">Activity</p>
          <h2 id="activity-heading">Commercial record</h2>
        </header>
        {quote.rejected_reason && (
          <p className="rejection-reason">
            <strong>Rejection reason</strong>
            <span>{quote.rejected_reason}</span>
          </p>
        )}
        <HistoryTimeline
          events={(activityResult.data ?? []).map((activity) => ({
            id: activity.id,
            type: activity.event_type,
            title: activity.message,
            detail:
              activity.event_type === "quote.rejected" &&
              typeof activity.safe_metadata === "object" &&
              activity.safe_metadata &&
              !Array.isArray(activity.safe_metadata) &&
              typeof activity.safe_metadata.reason === "string"
                ? activity.safe_metadata.reason
                : undefined,
            actor: [
              activity.actor_name_snapshot,
              activity.actor_role_snapshot,
              activity.actor_source.replace("_", " "),
            ]
              .filter(Boolean)
              .join(" · "),
            at: activity.created_at,
            atLabel: new Intl.DateTimeFormat(quote.locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: context.membership.organization.timezone,
            }).format(new Date(activity.created_at)),
          }))}
        />
      </section>
      {issuedPrint && <IssuedPrintDocument {...issuedPrint} />}
    </section>
  );
}
