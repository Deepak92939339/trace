import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { CanonicalQuoteSnapshot } from "./canonical-snapshot";

const QUEUE_ERROR = "Unable to load the tenant approval queue.";
const ACTIVITY_LIMIT = 10;

export type ApprovalQueueRevision = {
  id: string;
  approvalReasonCodes: string[];
  snapshot: CanonicalQuoteSnapshot | null;
  totalMinor: number | null;
  approvalThresholdBps: number | null;
  submittedAt: string | null;
};

export type ApprovalQueueActivity = {
  id: string;
  eventType: string;
  actorName: string;
  actorRole: string;
  actorSource: string;
  message: string;
  createdAt: string;
};

export type ApprovalQueueItem = {
  id: string;
  number: string;
  customerName: string | null;
  discountBps: number;
  approvalThresholdBps: number | null;
  currencyCode: string;
  locale: string;
  totalMinor: number;
  submittedAt: string | null;
  version: number;
  currentRevision: ApprovalQueueRevision | null;
  parentSnapshot: CanonicalQuoteSnapshot | null;
  submitterName: string | null;
  activity: ApprovalQueueActivity[];
  /**
   * Internal margin at submission. All three are null when the caller lacks
   * margin.read (the database returns no row), so absence never reveals data.
   * `marginBps` is also null when no line has a cost.
   */
  marginBps: number | null;
  floorBps: number | null;
  linesWithoutCost: number | null;
};

const REVISION_COLUMNS =
  "id, parent_revision_id, approval_reason_codes, snapshot, total_minor, approval_threshold_bps, submitted_at";

export async function loadApprovalQueue(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  organizationToday: string,
): Promise<ApprovalQueueItem[]> {
  const { data: quotes, error } = await supabase
    .from("quotes")
    .select(
      "id, number, customer_name_snapshot, discount_bps, approval_threshold_bps_snapshot, currency_code, locale, total_minor, submitted_at, version, current_revision_id",
    )
    .eq("organization_id", organizationId)
    .eq("state", "waiting")
    .gte("valid_until", organizationToday)
    .order("submitted_at");
  if (error) throw new Error(QUEUE_ERROR);
  if (!quotes || quotes.length === 0) return [];

  const quoteIds = quotes.map((quote) => quote.id);
  const currentIds = quotes.flatMap((quote) =>
    quote.current_revision_id ? [quote.current_revision_id] : [],
  );

  const [currentResult, activityResult, marginResult] = await Promise.all([
    currentIds.length
      ? supabase
          .from("quote_revisions")
          .select(REVISION_COLUMNS)
          .eq("organization_id", organizationId)
          .in("id", currentIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("quote_activity")
      .select(
        "id, quote_id, event_type, actor_name_snapshot, actor_role_snapshot, actor_source, message, created_at",
      )
      .eq("organization_id", organizationId)
      .in("quote_id", quoteIds)
      .order("created_at", { ascending: false }),
    currentIds.length
      ? supabase
          .from("quote_revision_margins")
          .select(
            "revision_id, margin_bps, margin_floor_bps, lines_without_cost",
          )
          .eq("organization_id", organizationId)
          .in("revision_id", currentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (currentResult.error || activityResult.error || marginResult.error)
    throw new Error(QUEUE_ERROR);
  const marginByRevision = new Map(
    (marginResult.data ?? []).map((row) => [row.revision_id, row]),
  );

  const currentById = new Map(
    (currentResult.data ?? []).map((revision) => [revision.id, revision]),
  );
  const parentIds = [
    ...new Set(
      (currentResult.data ?? []).flatMap((revision) =>
        revision.parent_revision_id ? [revision.parent_revision_id] : [],
      ),
    ),
  ];
  const parentResult = parentIds.length
    ? await supabase
        .from("quote_revisions")
        .select("id, snapshot")
        .eq("organization_id", organizationId)
        .in("id", parentIds)
    : { data: [], error: null };
  if (parentResult.error) throw new Error(QUEUE_ERROR);
  const parentSnapshotById = new Map(
    (parentResult.data ?? []).map((revision) => [
      revision.id,
      revision.snapshot as unknown as CanonicalQuoteSnapshot | null,
    ]),
  );

  const activityByQuote = new Map<string, ApprovalQueueActivity[]>();
  const submitterByQuote = new Map<string, string>();
  for (const row of activityResult.data ?? []) {
    if (
      (row.event_type === "quote.submitted" ||
        row.event_type === "quote.revision_submit") &&
      !submitterByQuote.has(row.quote_id)
    ) {
      submitterByQuote.set(row.quote_id, row.actor_name_snapshot);
    }
    const list = activityByQuote.get(row.quote_id) ?? [];
    if (list.length < ACTIVITY_LIMIT) {
      list.push({
        id: row.id,
        eventType: row.event_type,
        actorName: row.actor_name_snapshot,
        actorRole: row.actor_role_snapshot,
        actorSource: row.actor_source,
        message: row.message,
        createdAt: row.created_at,
      });
      activityByQuote.set(row.quote_id, list);
    }
  }

  return quotes.map((quote) => {
    const revision = quote.current_revision_id
      ? currentById.get(quote.current_revision_id)
      : undefined;
    const margin = quote.current_revision_id
      ? marginByRevision.get(quote.current_revision_id)
      : undefined;
    return {
      id: quote.id,
      number: quote.number,
      customerName: quote.customer_name_snapshot,
      discountBps: quote.discount_bps,
      approvalThresholdBps: quote.approval_threshold_bps_snapshot,
      currencyCode: quote.currency_code,
      locale: quote.locale,
      totalMinor: quote.total_minor,
      submittedAt: quote.submitted_at,
      version: quote.version,
      currentRevision: revision
        ? {
            id: revision.id,
            approvalReasonCodes: revision.approval_reason_codes,
            snapshot:
              revision.snapshot as unknown as CanonicalQuoteSnapshot | null,
            totalMinor: revision.total_minor,
            approvalThresholdBps: revision.approval_threshold_bps,
            submittedAt: revision.submitted_at,
          }
        : null,
      parentSnapshot: revision?.parent_revision_id
        ? (parentSnapshotById.get(revision.parent_revision_id) ?? null)
        : null,
      submitterName: submitterByQuote.get(quote.id) ?? null,
      activity: activityByQuote.get(quote.id) ?? [],
      marginBps: margin?.margin_bps ?? null,
      floorBps: margin?.margin_floor_bps ?? null,
      linesWithoutCost: margin?.lines_without_cost ?? null,
    };
  });
}
