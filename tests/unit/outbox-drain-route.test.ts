import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const drain = vi.fn();
vi.mock("../../lib/outbox/drain", () => ({ drainOutbox: drain }));
vi.mock("../../lib/outbox/privileged-outbox", () => ({
  claimEmails: vi.fn(),
  completeEmail: vi.fn(),
  mintBuyerLink: vi.fn(),
  OutboxUnavailableError: class extends Error {},
  outboxCredentialConfigured: () => true,
}));

import { authorizeDrain } from "../../lib/outbox/drain-auth";

const SECRET = "s".repeat(48);
const SECRET_ENV = "TRACE_OUTBOX_DRAIN_SECRET";

function request(authorization?: string) {
  return new Request("http://localhost/api/outbox/drain", {
    method: "POST",
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.stubEnv(SECRET_ENV, SECRET);
  vi.stubEnv("TRACE_MAIL_PROVIDER", "smtp");
  vi.stubEnv("TRACE_MAIL_FROM", "Trace <quotes@example.test>");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  drain.mockReset();
  drain.mockResolvedValue({
    claimed: 2,
    sent: 2,
    retried: 0,
    dead: 0,
    cancelled: 0,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("authorizeDrain", () => {
  it("accepts exactly the bearer secret", () => {
    expect(authorizeDrain(`Bearer ${SECRET}`)).toBe("ok");
  });

  it.each([
    [null],
    [""],
    [SECRET],
    [`bearer ${SECRET}`],
    [`Basic ${SECRET}`],
    [`Bearer ${SECRET}x`],
    [`Bearer ${SECRET.slice(1)}`],
    [`Bearer  ${SECRET}`],
    ["Bearer "],
  ])("rejects %j", (header) => {
    expect(authorizeDrain(header)).toBe("unauthorized");
  });

  it("is unconfigured, not open, without a long enough secret", () => {
    expect(authorizeDrain(`Bearer ${SECRET}`, {})).toBe("unconfigured");
    expect(authorizeDrain("Bearer short", { [SECRET_ENV]: "short" })).toBe(
      "unconfigured",
    );
  });

  it("does not accept a custom header form (bearer only)", async () => {
    const { POST } = await import("../../app/api/outbox/drain/route");
    const response = await POST(
      new Request("http://localhost/api/outbox/drain", {
        method: "POST",
        headers: { "x-tender-outbox-secret": SECRET },
      }),
    );
    expect(response.status).toBe(401);
    expect(drain).not.toHaveBeenCalled();
  });
});

describe("POST /api/outbox/drain", () => {
  it("401 without or with the wrong secret, with no detail and no draining", async () => {
    const { POST } = await import("../../app/api/outbox/drain/route");
    for (const header of [undefined, "Bearer nope", `Bearer ${SECRET}z`]) {
      const response = await POST(request(header));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(await response.json()).toEqual({ error: "unauthorized" });
    }
    expect(drain).not.toHaveBeenCalled();
  });

  it("503 when the scheduler secret is not configured", async () => {
    vi.stubEnv(SECRET_ENV, "");
    const { POST } = await import("../../app/api/outbox/drain/route");
    const response = await POST(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(drain).not.toHaveBeenCalled();
  });

  it("503 naming only variable names when mail is not configured", async () => {
    vi.stubEnv("TRACE_MAIL_FROM", "");
    const { POST } = await import("../../app/api/outbox/drain/route");
    const response = await POST(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "not_configured",
      missing: ["TRACE_MAIL_FROM"],
    });
  });

  it("drains and returns counts only", async () => {
    const { POST } = await import("../../app/api/outbox/drain/route");
    const response = await POST(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      claimed: 2,
      sent: 2,
      retried: 0,
      dead: 0,
      cancelled: 0,
    });
    expect(drain).toHaveBeenCalledTimes(1);
  });

  it("a failing drain is a 500 without internals", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    drain.mockRejectedValue(new Error("db password leaked here"));
    const { POST } = await import("../../app/api/outbox/drain/route");
    const response = await POST(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("leaked");
  });

  it("exports POST only", async () => {
    const route = await import("../../app/api/outbox/drain/route");
    expect(
      Object.keys(route).filter((name) =>
        /^(GET|PUT|PATCH|DELETE)$/.test(name),
      ),
    ).toEqual([]);
  });
});
