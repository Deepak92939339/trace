import { formatMinor } from "@/lib/formatting/money";
import { formatBasisPoints } from "@/lib/formatting/basis-points";
import { dateInTimeZone } from "@/lib/quotes/effective-state";
import { requireApplicationContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { loadApprovalQueue } from "@/lib/quotes/approval-queue";
import { diffSnapshots } from "@/lib/quotes/revision-diff";
import {
  ApprovalsTable,
  type ApprovalDiffRow,
  type ApprovalMargin,
  type ApprovalRow,
} from "@/components/approvals/approvals-table";
import type { HistoryTimelineEvent } from "@/components/quotes/history-timeline";

function clampBpsToPercent(bps: number): number {
  if (bps <= 0) return 0;
  if (bps >= 10000) return 100;
  return (bps - (bps % 100)) / 100;
}

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diffDays) >= 1) {
    return rtf.format(diffDays, "day");
  }
  return rtf.format(diffHours, "hour");
}

export default async function ApprovalsPage() {
  const context = await requireApplicationContext();
  const supabase = await createClient();
  const organizationToday = dateInTimeZone(
    new Date(),
    context.membership.organization.timezone,
  );
  const quotes = await loadApprovalQueue(
    supabase,
    context.membership.organizationId,
    organizationToday,
  );
  const canDecide =
    context.capabilities.includes("quote.approve") ||
    context.capabilities.includes("quote.reject");
  const canReadMargin = context.capabilities.includes("margin.read");

  const rows: ApprovalRow[] = quotes.map((quote) => {
    const reasons = quote.currentRevision?.approvalReasonCodes ?? [];
    const margin: ApprovalMargin | null =
      canReadMargin && quote.marginBps !== null
        ? {
            value: formatBasisPoints(quote.marginBps),
            floor:
              quote.floorBps === null
                ? null
                : formatBasisPoints(quote.floorBps),
            tone: (reasons.includes("below_cost")
              ? "red"
              : reasons.includes("margin_under_floor")
                ? "amber"
                : "green") as "red" | "amber" | "green",
            linesWithoutCost: quote.linesWithoutCost ?? 0,
            percent: clampBpsToPercent(quote.marginBps),
            floorPercent:
              quote.floorBps === null
                ? null
                : clampBpsToPercent(quote.floorBps),
          }
        : null;

    const revNum = quote.currentRevision?.snapshot?.quote.revision_number;
    const revisionLabel =
      typeof revNum === "number" && revNum > 0
        ? `Rev ${revNum}`
        : quote.parentSnapshot === null
          ? "Rev 1"
          : "Rev 2+";

    let diff: ApprovalDiffRow[] | null = null;
    if (!quote.currentRevision?.snapshot || quote.parentSnapshot === null) {
      diff = null;
    } else {
      try {
        const rawDiffs = diffSnapshots(
          quote.parentSnapshot,
          quote.currentRevision.snapshot,
        );
        diff = rawDiffs.map((r) => {
          let before: string | null = null;
          let after: string | null = null;
          let delta: string | null = null;
          let direction: "up" | "down" | null = null;

          if (typeof r.beforeMinor === "number") {
            before = formatMinor(
              r.beforeMinor,
              quote.currencyCode,
              quote.locale,
            );
          } else if (typeof r.beforeText === "string") {
            before = r.beforeText;
          }

          if (typeof r.afterMinor === "number") {
            after = formatMinor(
              r.afterMinor,
              quote.currencyCode,
              quote.locale,
            );
          } else if (typeof r.afterText === "string") {
            after = r.afterText;
          }

          if (typeof r.deltaMinor === "number") {
            const absVal = r.deltaMinor < 0 ? -r.deltaMinor : r.deltaMinor;
            if (r.deltaMinor > 0) {
              direction = "up";
              delta = `+${formatMinor(absVal, quote.currencyCode, quote.locale)}`;
            } else if (r.deltaMinor < 0) {
              direction = "down";
              delta = `\u2212${formatMinor(absVal, quote.currencyCode, quote.locale)}`;
            } else {
              direction = null;
              delta = formatMinor(0, quote.currencyCode, quote.locale);
            }
          }

          return {
            key: r.key,
            label: r.label,
            before,
            after,
            delta,
            direction,
          };
        });
      } catch {
        diff = [];
      }
    }

    const history: HistoryTimelineEvent[] = (quote.activity ?? []).map(
      (act) => ({
        id: act.id,
        type: act.eventType,
        title: act.message,
        actor: act.actorName,
        at: act.createdAt,
        atLabel: new Intl.DateTimeFormat(quote.locale, {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: context.membership.organization.timezone,
        }).format(new Date(act.createdAt)),
      }),
    );

    return {
      id: quote.id,
      version: quote.version,
      number: quote.number,
      href: `/quotes/${encodeURIComponent(quote.number)}`,
      customer: quote.customerName,
      discount: `${(quote.discountBps / 100).toFixed(2)}%`,
      threshold:
        quote.approvalThresholdBps === null
          ? null
          : `${(quote.approvalThresholdBps / 100).toFixed(2)}%`,
      total: formatMinor(quote.totalMinor, quote.currencyCode, quote.locale),
      waiting: formatRelativeTime(quote.submittedAt),
      waitingIso: quote.submittedAt,
      reasons: quote.currentRevision?.approvalReasonCodes ?? [],
      submitter: quote.submitterName ?? null,
      revisionLabel,
      diff,
      history,
      margin,
    };
  });

  return <ApprovalsTable rows={rows} canDecide={canDecide} />;
}
