import type { MailEnv } from "./types";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Authenticates the scheduler. Only "Authorization: Bearer <secret>" is accepted, compared in
 * constant time (both sides are hashed first so the comparison length never depends on input).
 * The only module that reads the drain secret.
 */
export type DrainAuthResult = "ok" | "unauthorized" | "unconfigured";

const digest = (value: string) => createHash("sha256").update(value).digest();

export function authorizeDrain(
  authorization: string | null,
  env: MailEnv = process.env,
): DrainAuthResult {
  const secret = env.TRACE_OUTBOX_DRAIN_SECRET;
  if (!secret || secret.length < 32) return "unconfigured";
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? "");
  const presented = match?.[1] ?? "";
  const equal = timingSafeEqual(digest(presented), digest(secret));
  return equal && match ? "ok" : "unauthorized";
}
