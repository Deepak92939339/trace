"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Brand } from "@/components/ui/brand";
import { Paper } from "@/components/paper/paper";
import { ProposalView } from "@/components/proposal/proposal-view";
import type {
  BuyerQuoteProjection,
  VerificationProjection,
} from "@/lib/quotes/commitment-contracts";
import {
  normalizeVerificationCode,
  recipientQuoteViewModel,
  verificationViewModel,
  type RecipientQuoteViewModel,
} from "@/lib/public-quotes/view-model";
import type { AcceptanceProjection } from "@/lib/quotes/commitment-contracts";
import { AcceptanceReceipt } from "@/components/proposal/acceptance-receipt";
import { ErrorState, ExpiredNotice, Skeleton } from "@/components/states";
import styles from "./recipient.module.css";

type AccessStatus =
  | "loading"
  | "ready"
  | "invalid_link"
  | "rate_limited"
  | "session_invalid"
  | "unavailable"
  | "revoked"
  | "superseded"
  | "expired"
  | "accepted"
  | "already_responded"
  | "already_accepted"
  | "stale";
type DialogKind = "change" | "decline" | "accept" | null;
type MutationStatus =
  | "idle"
  | "pending"
  | "success"
  | AccessStatus
  | "idempotency_conflict"
  | "message_invalid"
  | "acceptance_evidence_invalid";
type VerificationState = {
  status:
    | "idle"
    | "pending"
    | "verified"
    | "not_found"
    | "invalid"
    | "unavailable"
    | "rate_limited";
  result: ReturnType<typeof verificationViewModel>;
};

const terminalMessages: Partial<Record<AccessStatus, string>> = {
  invalid_link: "This quotation link is not valid.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  session_invalid:
    "Your secure quotation session has expired. Open the original link again.",
  unavailable: "The quotation service is temporarily unavailable.",
  revoked: "This quotation link has been revoked.",
  superseded: "This quotation revision has been superseded.",
  expired: "This quotation has expired.",
  accepted: "This quotation has already been accepted.",
  already_responded: "A response has already been recorded for this revision.",
  already_accepted: "This quotation has already been accepted.",
  stale: "This revision is no longer current.",
};

function Dialog({
  open,
  title,
  pending,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  pending: boolean;
  onClose(): void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = ref.current;
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (
      panel?.querySelector<HTMLElement>("[data-autofocus]") ??
      focusable()[0] ??
      panel
    )?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      previous?.focus();
    };
  }, [open, pending, onClose]);
  if (!open) return null;
  return (
    <div className={`recipient-dialog-backdrop ${styles.dialogBackdrop}`}>
      <section
        ref={ref}
        className={`recipient-dialog ${styles.dialogPanel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className={styles.dialogTitle}>
          {title}
        </h2>
        {children}
      </section>
    </div>
  );
}

async function post(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({ status: "unavailable" }));
  return { response, result: result as Record<string, unknown> };
}

export function RecipientQuoteClient({ selector }: { selector: string }) {
  const [access, setAccess] = useState<AccessStatus>("loading");
  const [quote, setQuote] = useState<RecipientQuoteViewModel | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [mutation, setMutation] = useState<MutationStatus>("idle");
  const [acceptance, setAcceptance] = useState<AcceptanceProjection | null>(
    null,
  );
  const acceptanceKey = useRef<string | null>(null);
  const [verification, setVerification] = useState<VerificationState>({
    status: "idle",
    result: null,
  });

  useEffect(() => {
    let active = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const secret = fragment.get("secret");
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    if (!secret) {
      queueMicrotask(() => active && setAccess("invalid_link"));
      return;
    }
    void post("/api/public-quotes/session", { selector, secret })
      .then(({ result }) => {
        if (!active) return;
        if (result.status) {
          setAccess(result.status as AccessStatus);
          return;
        }
        const projection = result as unknown as BuyerQuoteProjection;
        setQuote(recipientQuoteViewModel(projection));
        setAccess("ready");
        void post("/api/public-quotes/action", {
          action: "record_event",
          eventType: "viewed",
          idempotencyKey: crypto.randomUUID(),
        });
      })
      .catch(() => active && setAccess("unavailable"));
    return () => {
      active = false;
    };
  }, [selector]);

  async function submit(
    action: "change_requested" | "declined",
    message?: string,
  ) {
    setMutation("pending");
    const body =
      action === "change_requested"
        ? {
            action: "record_event",
            eventType: action,
            message,
            idempotencyKey: crypto.randomUUID(),
          }
        : {
            action: "record_event",
            eventType: action,
            idempotencyKey: crypto.randomUUID(),
          };
    const { result } = await post("/api/public-quotes/action", body).catch(
      () => ({ result: { status: "unavailable" } }),
    );
    const status = result.status as MutationStatus | undefined;
    if (status) {
      setMutation(status);
      if (terminalMessages[status as AccessStatus])
        setAccess(status as AccessStatus);
      return;
    }
    setMutation("success");
    setQuote((current) =>
      current ? { ...current, responseType: action } : current,
    );
  }

  async function verify(value: string) {
    const verificationCode = normalizeVerificationCode(value);
    if (!verificationCode) {
      setVerification({ status: "invalid", result: null });
      return;
    }
    setVerification({ status: "pending", result: null });
    const { result } = await post("/api/public-quotes/verify", {
      verificationCode,
    }).catch(() => ({ result: { status: "unavailable" } }));
    if (result.status) {
      setVerification({
        status: result.status as "not_found" | "unavailable" | "rate_limited",
        result: null,
      });
      return;
    }
    setVerification({
      status: "verified",
      result: verificationViewModel(
        result as unknown as VerificationProjection,
      ),
    });
  }

  async function accept(buyerAssertedName: string, buyerAssertedTitle: string) {
    setMutation("pending");
    acceptanceKey.current ??= crypto.randomUUID();
    const { result } = await post("/api/public-quotes/action", {
      action: "accept",
      idempotencyKey: acceptanceKey.current,
      buyerAssertedName,
      buyerAssertedTitle: buyerAssertedTitle || null,
      acceptanceStatementVersion: quote?.acceptanceStatementVersion,
    }).catch(() => ({ result: { status: "unavailable" } }));
    const status = result.status as MutationStatus | undefined;
    if (status) {
      setMutation(status);
      if (terminalMessages[status as AccessStatus])
        setAccess(status as AccessStatus);
      return;
    }
    setAcceptance(result as unknown as AcceptanceProjection);
    setMutation("success");
    setQuote((current) =>
      current ? { ...current, responseType: "accepted" } : current,
    );
    setDialog(null);
  }

  if (access !== "ready" || !quote)
    return (
      <main id="main-content" className={`recipient-shell ${styles.shell}`}>
        <header className={`recipient-header ${styles.header}`}>
          <Brand href="" muted size="sm" />
        </header>
        <section className={styles.access} role="status" aria-live="polite">
          {access === "loading" ? (
            <>
              <h1 className={styles.accessTitle}>Opening quotation</h1>
              <p className={styles.accessMessage}>
                Establishing a secure session…
              </p>
              <Skeleton variant="document" />
            </>
          ) : access === "expired" ? (
            <ExpiredNotice
              tone="expired"
              title="Quotation unavailable"
              body={terminalMessages[access]}
            />
          ) : [
              "revoked",
              "superseded",
              "stale",
              "accepted",
              "already_accepted",
              "already_responded",
            ].includes(access) ? (
            <ExpiredNotice
              tone="closed"
              title="Quotation unavailable"
              body={terminalMessages[access]}
            />
          ) : (
            <ErrorState
              title="Quotation unavailable"
              body={terminalMessages[access]}
            />
          )}
        </section>
      </main>
    );

  const canRespond =
    quote.effectiveState === "issued" && quote.responseType === null;

  return (
    <main id="main-content" className={`recipient-shell ${styles.shell}`}>
      <header className={`recipient-header ${styles.header}`}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span>Secure quotation view</span>
      </header>

      {acceptance && (
        <AcceptanceReceipt acceptance={acceptance} quote={quote} />
      )}

      <ProposalView
        quote={quote}
        canRespond={canRespond}
        onRequestChanges={() => {
          setMutation("idle");
          setDialog("change");
        }}
        onDecline={() => {
          setMutation("idle");
          setDialog("decline");
        }}
        onAccept={() => {
          acceptanceKey.current = null;
          setMutation("idle");
          setDialog("accept");
        }}
      />

      <div className={styles.lowerWrap}>
        <VerificationSection verification={verification} onSubmit={verify} />

        <footer className={styles.footer}>
          <span className={styles.footerInner}>
            Secured by <Brand href="" muted size="sm" />
          </span>
        </footer>
      </div>

      <ChangeDialog
        open={dialog === "change"}
        pending={mutation === "pending"}
        status={mutation}
        onClose={() => setDialog(null)}
        onSubmit={(message) => void submit("change_requested", message)}
      />
      <DeclineDialog
        open={dialog === "decline"}
        pending={mutation === "pending"}
        status={mutation}
        onClose={() => setDialog(null)}
        onSubmit={() => void submit("declined")}
      />
      <AcceptanceDialog
        open={dialog === "accept"}
        pending={mutation === "pending"}
        status={mutation}
        statement={quote.acceptanceStatement}
        onClose={() => setDialog(null)}
        onSubmit={(name, title) => void accept(name, title)}
      />
    </main>
  );
}

function ChangeDialog({
  open,
  pending,
  status,
  onClose,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  status: MutationStatus;
  onClose(): void;
  onSubmit(message: string): void;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog
      open={open}
      title="Request changes"
      pending={pending}
      onClose={onClose}
    >
      <p>
        A change request records your message only. It does not modify the
        issued quotation or promise a replacement revision.
      </p>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          const trimmed = message.trim();
          if (!trimmed || Array.from(trimmed).length > 2000) {
            setError("Enter a message of 1 to 2,000 characters.");
            return;
          }
          onSubmit(trimmed);
        }}
      >
        <label className={styles.label}>
          Message to the issuer
          <textarea
            className={styles.textarea}
            data-autofocus
            value={message}
            maxLength={2000}
            disabled={pending}
            onChange={(event) => {
              setMessage(event.target.value);
              setError("");
            }}
          />
        </label>
        <small>{Array.from(message).length}/2,000 characters</small>
        {error && <p role="alert">{error}</p>}
        {status === "success" && (
          <p role="status">Your change request was recorded.</p>
        )}
        {status !== "idle" && status !== "pending" && status !== "success" && (
          <p role="alert">
            {terminalMessages[status as AccessStatus] ??
              "The request could not be recorded."}
          </p>
        )}
        <div className={`recipient-dialog-actions ${styles.dialogActions}`}>
          <button
            className={styles.btn}
            type="button"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            type="submit"
            disabled={pending}
          >
            {pending ? "Recording…" : "Send change request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function DeclineDialog({
  open,
  pending,
  status,
  onClose,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  status: MutationStatus;
  onClose(): void;
  onSubmit(): void;
}) {
  return (
    <Dialog
      open={open}
      title="Decline quotation"
      pending={pending}
      onClose={onClose}
    >
      <p>
        Declining records a terminal response for this exact issued revision.
      </p>
      {status !== "idle" && status !== "pending" && (
        <p role="status">
          {status === "success"
            ? "Your decline was recorded."
            : (terminalMessages[status as AccessStatus] ??
              "The decline could not be recorded.")}
        </p>
      )}
      <div className={`recipient-dialog-actions ${styles.dialogActions}`}>
        <button className={styles.btn} onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={onSubmit}
          disabled={pending}
          data-autofocus
        >
          {pending ? "Recording…" : "Confirm decline"}
        </button>
      </div>
    </Dialog>
  );
}

function AcceptanceDialog({
  open,
  pending,
  status,
  statement,
  onClose,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  status: MutationStatus;
  statement: string;
  onClose(): void;
  onSubmit(name: string, title: string): void;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  return (
    <Dialog
      open={open}
      title="Accept quotation"
      pending={pending}
      onClose={onClose}
    >
      <p className={`recipient-statement ${styles.dialogStatement}`}>
        {statement}
      </p>
      <p>
        Acceptance is an electronic commercial acknowledgement. Trace does not
        certify identity and no drawn signature is requested.
      </p>
      <form
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          const normalizedName = name.normalize("NFC").trim();
          const normalizedTitle = title.normalize("NFC").trim();
          const valid = (value: string, optional = false) =>
            (optional && !value) ||
            (Array.from(value).length >= 1 &&
              Array.from(value).length <= 200 &&
              !/[\u0000-\u001f\u007f-\u009f]/.test(value));
          if (!valid(normalizedName) || !valid(normalizedTitle, true)) {
            setError(
              "Enter a buyer-asserted name and an optional title of up to 200 supported characters.",
            );
            return;
          }
          setError("");
          onSubmit(normalizedName, normalizedTitle);
        }}
      >
        <label className={styles.label}>
          Buyer-asserted full name
          <input
            className={styles.input}
            data-autofocus
            autoComplete="name"
            value={name}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className={styles.label}>
          Buyer-asserted title (optional)
          <input
            className={styles.input}
            autoComplete="organization-title"
            value={title}
            disabled={pending}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <p>
          These details are buyer-asserted only; Trace does not certify
          identity.
        </p>
        {error && <p role="alert">{error}</p>}
        {status !== "idle" && status !== "pending" && status !== "success" && (
          <p role="alert">
            {terminalMessages[status as AccessStatus] ??
              "Acceptance could not be recorded."}
          </p>
        )}
        <div className={`recipient-dialog-actions ${styles.dialogActions}`}>
          <button
            className={styles.btn}
            type="button"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            type="submit"
            disabled={pending}
          >
            {pending ? "Recording…" : "Accept quotation"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function VerificationSection({
  verification,
  onSubmit,
}: {
  verification: VerificationState;
  onSubmit(value: string): void;
}) {
  const [value, setValue] = useState("");
  const result = verification.result;
  return (
    <div className={`recipient-verification ${styles.verification}`}>
      <Paper padding="md" as="section">
        <h2 className={styles.verificationTitle}>Verify a quotation</h2>
        <p>Enter the 32-character code from the document footer.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(value);
          }}
        >
          <label className={styles.label}>
            Verification code
            <input
              className={styles.input}
              value={value}
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <button
            className={styles.btn}
            disabled={verification.status === "pending"}
          >
            {verification.status === "pending" ? "Checking…" : "Verify record"}
          </button>
        </form>
        <div aria-live="polite">
          {verification.status === "verified" && result && (
            <p className={`recipient-verified ${styles.verifiedResult}`}>
              Verified · {result.quoteNumber} revision {result.revisionNumber} ·{" "}
              {result.totalDisplay}
            </p>
          )}
          {verification.status === "invalid" && (
            <p>
              The verification code must contain exactly 32 hexadecimal
              characters.
            </p>
          )}
          {verification.status === "not_found" && (
            <p>No issued revision matches this code.</p>
          )}
          {verification.status === "rate_limited" && (
            <p>Too many verification attempts. Please wait and try again.</p>
          )}
          {verification.status === "unavailable" && (
            <p>Verification is temporarily unavailable.</p>
          )}
        </div>
      </Paper>
    </div>
  );
}
