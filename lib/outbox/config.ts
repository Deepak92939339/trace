import type { MailEnv } from "./types";
import {
  createResendProvider,
  RESEND_KEY_ENV,
  resendConfigured,
} from "./providers/resend";
import { createSmtpProvider } from "./providers/smtp";
import type { MailProvider } from "./providers/types";

/** Non-secret settings plus provider choice. Secrets stay inside their own modules. */
export type MailConfig =
  | { ok: true; from: string; appUrl: string; provider: MailProvider }
  | { ok: false; missing: string[] };

export function getMailConfig(env: MailEnv = process.env): MailConfig {
  const missing: string[] = [];
  const from = env.TRACE_MAIL_FROM?.trim() ?? "";
  if (!from || !from.includes("@") || /[\r\n]/.test(from))
    missing.push("TRACE_MAIL_FROM");
  let appUrl = (env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Error("scheme");
    appUrl = parsed.origin;
  } catch {
    missing.push("NEXT_PUBLIC_APP_URL");
  }
  const chosen =
    env.TRACE_MAIL_PROVIDER ?? (env.NODE_ENV === "production" ? "" : "smtp");
  let provider: MailProvider | null = null;
  if (chosen === "smtp") provider = createSmtpProvider(env);
  else if (chosen === "resend") {
    if (resendConfigured(env)) provider = createResendProvider(env);
    else missing.push(RESEND_KEY_ENV);
  } else missing.push("TRACE_MAIL_PROVIDER");
  if (missing.length || !provider) return { ok: false, missing };
  return { ok: true, from, appUrl, provider };
}
