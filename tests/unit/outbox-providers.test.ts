import { describe, expect, it, vi } from "vitest";
import { getMailConfig } from "../../lib/outbox/config";
import {
  classifyResendStatus,
  createResendProvider,
  resendConfigured,
} from "../../lib/outbox/providers/resend";
import {
  classifySmtpError,
  smtpSettings,
} from "../../lib/outbox/providers/smtp";
import { MailError } from "../../lib/outbox/providers/types";

const message = {
  from: "Trace <quotes@example.test>",
  to: "buyer@example.test",
  replyTo: "sales@example.test",
  subject: "Quotation TND-1",
  text: "Hello\n",
};
const KEY_ENV = { ["TRACE_RESEND_API_KEY"]: "test-provider-key" };

describe("Resend provider", () => {
  it("posts one JSON request with bearer auth, reply_to, and no idempotency header", async () => {
    const fetchStub = vi.fn(async () =>
      Response.json({ id: "re_123" }, { status: 200 }),
    );
    const receipt = await createResendProvider(
      KEY_ENV,
      fetchStub as unknown as typeof fetch,
    ).send(message);
    expect(receipt).toEqual({ providerMessageId: "re_123" });
    const [url, init] = fetchStub.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-provider-key");
    expect(
      Object.keys(headers).map((name) => name.toLowerCase()),
    ).not.toContain("idempotency-key");
    expect(JSON.parse(init.body as string)).toEqual({
      from: message.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      reply_to: message.replyTo,
    });
  });

  it("omits reply_to when there is none", async () => {
    const fetchStub = vi.fn(async () => Response.json({ id: "re_1" }));
    await createResendProvider(
      KEY_ENV,
      fetchStub as unknown as typeof fetch,
    ).send({ ...message, replyTo: undefined });
    const body = JSON.parse(
      (fetchStub.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body).not.toHaveProperty("reply_to");
  });

  it.each([
    [429, "rate_limited", true],
    [500, "provider_unavailable", true],
    [503, "provider_unavailable", true],
    [401, "configuration", false],
    [403, "configuration", false],
    [422, "invalid_recipient", false],
    [400, "invalid_recipient", false],
    [404, "provider_rejected", false],
  ])("HTTP %i is %s (retryable: %s)", async (status, code, retryable) => {
    expect(classifyResendStatus(status)).toMatchObject({ code, retryable });
    const fetchStub = vi.fn(async () => new Response("{}", { status }));
    await expect(
      createResendProvider(KEY_ENV, fetchStub as unknown as typeof fetch).send(
        message,
      ),
    ).rejects.toMatchObject({ code, retryable });
  });

  it("network failures and timeouts are retryable; a missing id is a retryable failure", async () => {
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(
      createResendProvider(KEY_ENV, down as unknown as typeof fetch).send(
        message,
      ),
    ).rejects.toMatchObject({ code: "provider_unavailable", retryable: true });
    const slow = vi.fn(async () => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    await expect(
      createResendProvider(KEY_ENV, slow as unknown as typeof fetch).send(
        message,
      ),
    ).rejects.toMatchObject({ code: "timeout", retryable: true });
    const empty = vi.fn(async () => Response.json({}));
    await expect(
      createResendProvider(KEY_ENV, empty as unknown as typeof fetch).send(
        message,
      ),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("without a key it fails permanently as a configuration error and never calls the network", async () => {
    const fetchStub = vi.fn();
    expect(resendConfigured({})).toBe(false);
    await expect(
      createResendProvider({}, fetchStub as unknown as typeof fetch).send(
        message,
      ),
    ).rejects.toMatchObject({ code: "configuration", retryable: false });
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("errors never contain the key or the recipient", async () => {
    const fetchStub = vi.fn(async () => new Response("{}", { status: 500 }));
    const error = await createResendProvider(
      KEY_ENV,
      fetchStub as unknown as typeof fetch,
    )
      .send(message)
      .then(
        () => null,
        (caught: unknown) => caught as MailError,
      );
    expect(error).toBeInstanceOf(MailError);
    expect(error!.message).not.toContain("test-provider-key");
    expect(error!.message).not.toContain(message.to);
  });
});

describe("SMTP provider classification", () => {
  it.each([
    [{ code: "ECONNREFUSED" }, "provider_unavailable", true],
    [{ code: "ETIMEDOUT" }, "timeout", true],
    [{ code: "ECONNRESET" }, "provider_unavailable", true],
    [{ responseCode: 421 }, "provider_unavailable", true],
    [{ responseCode: 451 }, "provider_unavailable", true],
    [{ responseCode: 550 }, "invalid_recipient", false],
    [{ responseCode: 553 }, "invalid_recipient", false],
    [{ responseCode: 554 }, "provider_rejected", false],
    [{}, "provider_unavailable", true],
  ])("%j -> %s (retryable: %s)", (failure, code, retryable) => {
    expect(classifySmtpError(failure)).toMatchObject({ code, retryable });
  });

  it("settings default to the local mail catcher's published port", () => {
    expect(smtpSettings({})).toEqual({ host: "127.0.0.1", port: 54325 });
    expect(smtpSettings({ TRACE_MAIL_SMTP_PORT: "1" })).toEqual({
      host: "127.0.0.1",
      port: 1,
    });
    expect(smtpSettings({ TRACE_MAIL_SMTP_PORT: "nonsense" }).port).toBe(54325);
  });
});

describe("mail configuration", () => {
  const base = {
    TRACE_MAIL_FROM: "Trace <quotes@example.test>",
    NEXT_PUBLIC_APP_URL: "https://app.example.test/",
  };

  it("local default is SMTP; the app URL is normalised to its origin", () => {
    const config = getMailConfig({ ...base, NODE_ENV: "development" });
    expect(config).toMatchObject({
      ok: true,
      appUrl: "https://app.example.test",
    });
    expect(config.ok && config.provider.name).toBe("smtp");
  });

  it("production requires an explicit provider", () => {
    expect(getMailConfig({ ...base, NODE_ENV: "production" })).toEqual({
      ok: false,
      missing: ["TRACE_MAIL_PROVIDER"],
    });
  });

  it("resend needs its key, and reports what is missing by name only", () => {
    expect(getMailConfig({ ...base, TRACE_MAIL_PROVIDER: "resend" })).toEqual({
      ok: false,
      missing: ["TRACE_RESEND_API_KEY"],
    });
    expect(
      getMailConfig({ ...base, TRACE_MAIL_PROVIDER: "resend", ...KEY_ENV }),
    ).toMatchObject({ ok: true });
  });

  it("reports a missing sender and app URL, and rejects header-injecting senders", () => {
    expect(getMailConfig({ TRACE_MAIL_PROVIDER: "smtp" })).toEqual({
      ok: false,
      missing: ["TRACE_MAIL_FROM", "NEXT_PUBLIC_APP_URL"],
    });
    expect(
      getMailConfig({
        ...base,
        TRACE_MAIL_PROVIDER: "smtp",
        TRACE_MAIL_FROM: "a@b.test\nBcc: x@y.test",
      }),
    ).toMatchObject({ ok: false });
    expect(
      getMailConfig({
        ...base,
        NEXT_PUBLIC_APP_URL: "ftp://x",
        TRACE_MAIL_PROVIDER: "smtp",
      }),
    ).toMatchObject({ ok: false });
    expect(
      getMailConfig({ ...base, TRACE_MAIL_PROVIDER: "carrier-pigeon" }),
    ).toMatchObject({ ok: false });
  });
});
