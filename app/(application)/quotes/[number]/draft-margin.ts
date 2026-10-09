"use server";

import { requireApplicationContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

export type DraftMargin = {
  marginBps: number | null;
  floorBps: number | null;
  linesWithoutCost: number;
  belowCost: boolean;
  underFloor: boolean;
};

/**
 * Internal draft margin for the builder. Returns null when the caller lacks
 * margin.read, the quote is not a draft, or it belongs to another tenant —
 * the gated view simply returns no row, so absence reveals nothing.
 */
export async function getDraftMargin(
  quoteId: string,
): Promise<DraftMargin | null> {
  const context = await requireApplicationContext();
  if (!context.capabilities.includes("margin.read")) return null;
  if (typeof quoteId !== "string" || quoteId.length === 0) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_draft_margin")
    .select(
      "margin_bps, floor_bps, lines_without_cost, below_cost, under_floor",
    )
    .eq("quote_id", quoteId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    marginBps: data.margin_bps,
    floorBps: data.floor_bps,
    linesWithoutCost: data.lines_without_cost ?? 0,
    belowCost: data.below_cost === true,
    underFloor: data.under_floor === true,
  };
}
