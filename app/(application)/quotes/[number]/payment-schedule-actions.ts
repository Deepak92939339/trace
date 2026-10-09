"use server";

import { revalidatePath } from "next/cache";
import { requireApplicationContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { logMutationFailure } from "@/lib/errors/mutation-failure";
import {
  PAYMENT_TRIGGERS,
  validatePaymentMilestones,
  type PaymentMilestoneInput,
} from "@/lib/quotes/payment-schedule";

export type SavePaymentScheduleResult =
  | { status: "ok"; version: number; message: string }
  | { status: "invalid" | "stale" | "failed"; message: string };

function normalise(raw: unknown): PaymentMilestoneInput[] | null {
  if (!Array.isArray(raw)) return null;
  const out: PaymentMilestoneInput[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const e = entry as Record<string, unknown>;
    if (typeof e.label !== "string") return null;
    if (typeof e.basis_points !== "number") return null;
    if (
      typeof e.trigger !== "string" ||
      !(PAYMENT_TRIGGERS as readonly string[]).includes(e.trigger)
    )
      return null;
    if (e.due_date !== null && typeof e.due_date !== "string") return null;
    out.push({
      label: e.label.trim(),
      basis_points: e.basis_points,
      trigger: e.trigger as PaymentMilestoneInput["trigger"],
      due_date: e.trigger === "on_date" ? (e.due_date as string | null) : null,
    });
  }
  return out;
}

/**
 * Replaces a draft quote's whole payment schedule. The database is
 * authoritative: it re-validates, checks quote.edit, draft state and the
 * expected version, and bumps the quote version once. The caller must adopt
 * the returned version before its next draft save.
 */
export async function savePaymentSchedule(input: {
  quoteId: string;
  expectedVersion: number;
  issueDate: string;
  milestones: unknown;
}): Promise<SavePaymentScheduleResult> {
  const context = await requireApplicationContext();
  if (!context.capabilities.includes("quote.edit"))
    return {
      status: "failed",
      message: "This account cannot edit the quotation. Nothing changed.",
    };
  if (
    typeof input.quoteId !== "string" ||
    !Number.isSafeInteger(input.expectedVersion) ||
    typeof input.issueDate !== "string"
  )
    return {
      status: "invalid",
      message: "The payment schedule was not valid. Nothing changed.",
    };
  const milestones = normalise(input.milestones);
  if (!milestones)
    return {
      status: "invalid",
      message: "The payment schedule was not valid. Nothing changed.",
    };
  const problem = validatePaymentMilestones(milestones, input.issueDate);
  if (problem) return { status: "invalid", message: problem };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_payment_schedule_editor")
    // Generated view types mark this column read-only; the INSTEAD OF trigger
    // is the real write path and validates the payload server-side.
    .update({ milestones } as never)
    .eq("quote_id", input.quoteId)
    .eq("version", input.expectedVersion)
    .select("version");
  if (error) {
    if (error.message?.includes("quote_version_stale"))
      return {
        status: "stale",
        message:
          "This quotation changed elsewhere. Reload before editing the schedule.",
      };
    if (error.message?.includes("payment_schedule_invalid"))
      return {
        status: "invalid",
        message: "The database rejected this schedule. Nothing changed.",
      };
    logMutationFailure("quote.payment_schedule_save", error);
    return {
      status: "failed",
      message: "The payment schedule could not be saved. Nothing changed.",
    };
  }
  const version = data?.length === 1 ? data[0]?.version : null;
  if (typeof version !== "number")
    return {
      status: "stale",
      message:
        "This quotation changed elsewhere or is no longer a draft. Reload before editing the schedule.",
    };
  revalidatePath("/quotes");
  return {
    status: "ok",
    version,
    message: "Payment schedule saved.",
  };
}
