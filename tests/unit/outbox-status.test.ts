import { describe, expect, it } from "vitest";
import {
  emailErrorLabel,
  emailKindLabel,
  emailStatusLabel,
  type EmailActivityRow,
} from "../../lib/outbox/status";

const row = (over: Partial<EmailActivityRow>): EmailActivityRow => ({
  id: "1",
  kind: "quote_to_buyer",
  audience: "buyer",
  recipient_label: "b@example.test",
  display_status: "queued",
  attempts: 0,
  max_attempts: 6,
  created_at: "2026-10-01T00:00:00Z",
  sent_at: null,
  last_error_code: null,
  ...over,
});

describe("Emails list labels", () => {
  it("shows queued, retrying, sent, failed and not sent without ever saying delivered", () => {
    expect(emailStatusLabel(row({}))).toBe("Queued");
    expect(emailStatusLabel(row({ attempts: 2 }))).toBe(
      "Queued, retrying (attempt 3 of 6)",
    );
    expect(emailStatusLabel(row({ display_status: "sent" }))).toBe("Sent");
    expect(emailStatusLabel(row({ display_status: "failed" }))).toBe("Failed");
    expect(emailStatusLabel(row({ display_status: "cancelled" }))).toBe(
      "Not sent (quotation changed)",
    );
    for (const status of ["queued", "sent", "failed", "cancelled"])
      expect(emailStatusLabel(row({ display_status: status }))).not.toMatch(
        /deliver/i,
      );
  });

  it("maps every kind and error code to short human text, never the raw code", () => {
    expect(emailKindLabel("approval_waiting")).toBe("Waiting for approval");
    expect(emailKindLabel("surprise")).toBe("Email");
    expect(emailErrorLabel(null)).toBeNull();
    expect(emailErrorLabel("provider_unavailable")).not.toContain(
      "provider_unavailable",
    );
    expect(emailErrorLabel("nonsense_code")).toBe(
      "The message could not be sent.",
    );
  });
});
