import type { MailEnv } from "../types";
import { MailError, type MailMessage, type MailProvider } from "./types";

/**
 * Local provider: plain SMTP to the mail catcher bundled with the Supabase CLI (Mailpit). The
 * only module that loads nodemailer, and only when a message is actually sent.
 */
export function smtpSettings(env: MailEnv = process.env) {
  const port = Number(env.TRACE_MAIL_SMTP_PORT ?? "54325");
  return {
    host: env.TRACE_MAIL_SMTP_HOST || "127.0.0.1",
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 54325,
  };
}

const TRANSIENT = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ESOCKET",
  "ECONNECTION",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
]);

export function classifySmtpError(error: unknown): MailError {
  const failure = error as {
    code?: string;
    responseCode?: number;
    message?: string;
  };
  const response = failure.responseCode;
  if (typeof response === "number") {
    if (response >= 500)
      return new MailError(
        response === 550 || response === 553
          ? "invalid_recipient"
          : "provider_rejected",
        false,
        `SMTP ${response}`,
      );
    return new MailError("provider_unavailable", true, `SMTP ${response}`);
  }
  if (failure.code === "ETIMEDOUT")
    return new MailError("timeout", true, "SMTP timeout");
  if (failure.code && TRANSIENT.has(failure.code))
    return new MailError("provider_unavailable", true, `SMTP ${failure.code}`);
  return new MailError("provider_unavailable", true, "SMTP failure");
}

export function createSmtpProvider(env: MailEnv = process.env): MailProvider {
  const { host, port } = smtpSettings(env);
  return {
    name: "smtp",
    async send(message: MailMessage) {
      const { default: nodemailer } = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: false,
        ignoreTLS: true,
        connectionTimeout: 5_000,
        greetingTimeout: 5_000,
        socketTimeout: 10_000,
      });
      try {
        const info = await transport.sendMail({
          from: message.from,
          to: message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          text: message.text,
        });
        return {
          providerMessageId: String(info.messageId ?? "").slice(0, 200),
        };
      } catch (error) {
        throw classifySmtpError(error);
      } finally {
        transport.close();
      }
    },
  };
}
