import type { MailEnv } from "../types";
import { MailError, type MailMessage, type MailProvider } from "./types";

/**
 * Production provider: Resend's HTTP API (one POST, bearer key). The only module that reads
 * the provider key. Written to the documented API and not exercised against the live service
 * in P6; the request/response mapping is unit-tested against a stub.
 */
const ENDPOINT = "https://api.resend.com/emails";

/** Name of the variable holding the provider key (also used to report what is missing). */
export const RESEND_KEY_ENV = "TRACE_RESEND_API_KEY";

export function resendConfigured(env: MailEnv = process.env) {
  return Boolean(env.TRACE_RESEND_API_KEY);
}

export function classifyResendStatus(status: number): MailError {
  if (status === 429) return new MailError("rate_limited", true, "Resend 429");
  if (status >= 500)
    return new MailError("provider_unavailable", true, `Resend ${status}`);
  if (status === 401 || status === 403)
    return new MailError("configuration", false, `Resend ${status}`);
  if (status === 422 || status === 400)
    return new MailError("invalid_recipient", false, `Resend ${status}`);
  return new MailError("provider_rejected", false, `Resend ${status}`);
}

export function createResendProvider(
  env: MailEnv = process.env,
  fetchImplementation: typeof fetch = fetch,
): MailProvider {
  return {
    name: "resend",
    async send(message: MailMessage) {
      const key = env.TRACE_RESEND_API_KEY;
      if (!key)
        throw new MailError("configuration", false, "Resend key missing");
      let response: Response;
      try {
        response = await fetchImplementation(ENDPOINT, {
          method: "POST",
          headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        const timedOut =
          error instanceof Error &&
          (error.name === "TimeoutError" || error.name === "AbortError");
        throw new MailError(
          timedOut ? "timeout" : "provider_unavailable",
          true,
          timedOut ? "Resend timeout" : "Resend unreachable",
        );
      }
      if (!response.ok) throw classifyResendStatus(response.status);
      const body = (await response.json().catch(() => null)) as {
        id?: unknown;
      } | null;
      if (typeof body?.id !== "string" || body.id === "")
        throw new MailError("provider_unavailable", true, "Resend gave no id");
      return { providerMessageId: body.id.slice(0, 200) };
    },
  };
}
