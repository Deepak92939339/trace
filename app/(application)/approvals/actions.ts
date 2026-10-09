"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  runQuoteWorkflowAction,
  type WorkflowResult,
} from "@/app/(application)/quotes/actions";

export async function decideFromQueue(input: {
  quoteId: string;
  expectedVersion: number;
  decision: "approve" | "reject";
  reason?: string;
}): Promise<WorkflowResult> {
  const result = await runQuoteWorkflowAction({
    quoteId: input.quoteId,
    expectedVersion: input.expectedVersion,
    commandId: randomUUID(),
    action: input.decision,
    reason: input.reason,
  });
  revalidatePath("/approvals");
  return result;
}
