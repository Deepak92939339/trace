"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { queueQuoteEmailToBuyerAction } from "@/app/(application)/quotes/actions";
import {
  dateTimeLocalToInstant,
  toDateTimeLocalValue,
} from "@/lib/quotes/share-link";

type EmailToBuyerPanelProps = {
  quoteId: string;
  quoteVersion: number;
  revisionId: string;
  revisionNumber: number;
  timezone: string;
  maxExpiresAt: string;
  defaultExpiresAt: string;
};

export function EmailToBuyerPanel({
  quoteId,
  quoteVersion,
  revisionId,
  revisionNumber,
  timezone,
  maxExpiresAt,
  defaultExpiresAt,
}: EmailToBuyerPanelProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [expiresLocal, setExpiresLocal] = useState(
    toDateTimeLocalValue(new Date(defaultExpiresAt), timezone),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const commandRef = useRef<string | null>(null);

  async function queue() {
    setBusy(true);
    const expiresAt = dateTimeLocalToInstant(expiresLocal, timezone);
    if (!expiresAt) {
      setBusy(false);
      setMessage(
        `Choose a valid expiry date and time in the ${timezone} timezone.`,
      );
      return;
    }
    setMessage("Queuing the email…");
    const result = await queueQuoteEmailToBuyerAction({
      quoteId,
      revisionId,
      expectedVersion: quoteVersion,
      commandId: (commandRef.current ??= crypto.randomUUID()),
      recipientEmail: email,
      expiresAt: expiresAt.toISOString(),
    });
    setBusy(false);
    setMessage(result.message);
    if (result.status === "queued") {
      // The same command id is kept until the form changes, so a repeated click cannot queue twice.
      router.refresh();
    }
  }

  return (
    <section className="email-panel" aria-labelledby="email-to-buyer-heading">
      <header>
        <p className="eyebrow">Sharing</p>
        <h2 id="email-to-buyer-heading">Email to buyer</h2>
        <p>
          Send issued revision {revisionNumber} to the buyer by email with a
          personal link. Issuing a quotation never sends email by itself. The
          email is queued and sent shortly; it is not sent the moment you press
          the button.
        </p>
      </header>
      <form
        className="email-panel-form"
        onSubmit={(event) => {
          event.preventDefault();
          void queue();
        }}
      >
        <label>
          Buyer email
          <input
            type="email"
            name="buyerEmail"
            autoComplete="off"
            required
            minLength={3}
            maxLength={254}
            value={email}
            onChange={(event) => {
              commandRef.current = null;
              setEmail(event.target.value);
            }}
          />
        </label>
        <label>
          Buyer link expiry
          <input
            type="datetime-local"
            name="emailLinkExpiresAt"
            required
            max={toDateTimeLocalValue(new Date(maxExpiresAt), timezone)}
            value={expiresLocal}
            onChange={(event) => {
              commandRef.current = null;
              setExpiresLocal(event.target.value);
            }}
          />
        </label>
        <button className="button button-primary" type="submit" disabled={busy}>
          Email to buyer
        </button>
      </form>
      {message && (
        <p className="workflow-message" role="status" aria-live="polite">
          {message}
        </p>
      )}
    </section>
  );
}
