import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { dateInTimeZone } from "./effective-state";
import {
  FETCH_SIZE,
  listPage,
  listSearch,
  PAGE_SIZE,
  singleSearchValue,
  type ListSearchParams,
} from "@/lib/lists/pagination";

export const QUOTE_LIST_STATES = [
  "draft",
  "waiting",
  "approved",
  "rejected",
  "issued",
  "expired",
] as const;
export type QuoteListState = "all" | (typeof QUOTE_LIST_STATES)[number];

export function quoteListState(
  value: ListSearchParams[string],
): QuoteListState {
  const state = singleSearchValue(value);
  return QUOTE_LIST_STATES.includes(state as (typeof QUOTE_LIST_STATES)[number])
    ? (state as QuoteListState)
    : "all";
}

/** A literal substring regex, not user-authored regex or a LIKE wildcard. */
export function literalSearchPattern(search: string): string {
  return search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function quoteListQuery(
  client: SupabaseClient<Database>,
  context: { organizationId: string; timeZone: string },
  params: ListSearchParams,
  instant = new Date(),
) {
  const page = listPage(params.page);
  const search = listSearch(params.q);
  const state = quoteListState(params.state);
  const today = dateInTimeZone(instant, context.timeZone);
  let query = client
    .from("quotes")
    .select(
      "id,number,state,customer_name_snapshot,issue_date,valid_until,currency_code,locale,total_minor,updated_at,customers!inner(name),search_customer:customers()",
    )
    .eq("organization_id", context.organizationId);

  const groups: string[] = [];
  if (search) {
    // Empty embed filters matches without filtering the customer name displayed in the row.
    // Quote values inside logic expressions only. Ordinary filters take raw values.
    // Regex escaping makes punctuation literal in both locations.
    const pattern = JSON.stringify(literalSearchPattern(search));
    query = query.filter(
      "search_customer.name",
      "imatch",
      literalSearchPattern(search),
    );
    groups.push(
      `or(number.imatch.${pattern},and(state.eq.draft,search_customer.not.is.null),and(state.neq.draft,customer_name_snapshot.imatch.${pattern}),and(state.neq.draft,customer_name_snapshot.is.null,search_customer.not.is.null))`,
    );
  }
  if (state === "expired") {
    groups.push(
      `or(state.eq.expired,and(state.in.(draft,waiting,approved),valid_until.lt.${today}))`,
    );
  } else if (state !== "all") {
    query = query.eq("state", state);
    if (["draft", "waiting", "approved"].includes(state))
      query = query.gte("valid_until", today);
  }
  // One logic parameter: successive .or() calls would overwrite each other.
  if (groups.length) query = query.or(`and(${groups.join(",")})`);
  const offset = (page - 1) * PAGE_SIZE;
  return query
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + FETCH_SIZE - 1);
}
