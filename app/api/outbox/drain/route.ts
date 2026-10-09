import { getMailConfig } from "@/lib/outbox/config";
import { authorizeDrain } from "@/lib/outbox/drain-auth";
import { drainOutbox } from "@/lib/outbox/drain";
import {
  claimEmails,
  completeEmail,
  mintBuyerLink,
  OutboxUnavailableError,
  outboxCredentialConfigured,
} from "@/lib/outbox/privileged-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A pass drains for up to ~40 s; leave room for the last send.
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store" };

/**
 * Called by a scheduler (pg_cron + pg_net at deploy) or scripts/drain-outbox.mjs.
 * `Authorization: Bearer <drain secret>` only; there is no session and no cookie.
 */
export async function POST(request: Request) {
  const auth = authorizeDrain(request.headers.get("authorization"));
  if (auth === "unconfigured")
    return Response.json({ error: "not_configured" }, { status: 503, headers });
  if (auth !== "ok")
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: { ...headers, "WWW-Authenticate": "Bearer" } },
    );
  const config = getMailConfig();
  if (!config.ok || !outboxCredentialConfigured())
    return Response.json(
      {
        error: "not_configured",
        missing: config.ok ? [] : config.missing,
      },
      { status: 503, headers },
    );
  try {
    const summary = await drainOutbox({
      claim: claimEmails,
      mintLink: mintBuyerLink,
      complete: completeEmail,
      provider: config.provider,
      from: config.from,
      appUrl: config.appUrl,
      now: () => Date.now(),
    });
    return Response.json(summary, { headers });
  } catch (error) {
    if (error instanceof OutboxUnavailableError)
      return Response.json(
        { error: "not_configured" },
        { status: 503, headers },
      );
    console.error("outbox_drain_failed", {
      name: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message : "unknown",
    });
    return Response.json({ error: "drain_failed" }, { status: 500, headers });
  }
}
