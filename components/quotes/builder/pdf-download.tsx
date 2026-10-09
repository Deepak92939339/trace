"use client";

import { useState, type MouseEvent } from "react";
import styles from "./pdf-download.module.css";

export type PdfDownloadProps = {
  /** The revision's PDF route; works as a plain link without JavaScript. */
  href: string;
  /** A PDF is already registered for this revision. */
  available: boolean;
  /** The viewer holds quote.print, so opening the link may generate the PDF. */
  canGenerate: boolean;
  buttonClassName?: string;
};

export function PdfDownload({
  href,
  available,
  canGenerate,
  buttonClassName = "",
}: PdfDownloadProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (!available && !canGenerate) {
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={`button ${buttonClassName}`}
          disabled
          aria-describedby="pdf-not-generated"
        >
          Download PDF
        </button>
        <span id="pdf-not-generated" className={styles.note}>
          Not generated yet
        </span>
      </div>
    );
  }

  async function download(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(available ? "" : "Preparing the PDF…");
    try {
      const response = await fetch(`${href}?format=json`, {
        headers: { accept: "application/json" },
        credentials: "same-origin",
      });
      const body = (await response.json().catch(() => null)) as {
        url?: unknown;
        error?: { message?: unknown };
      } | null;
      if (
        !response.ok ||
        typeof body?.url !== "string" ||
        !/^https?:\/\//.test(body.url)
      ) {
        setMessage(
          typeof body?.error?.message === "string"
            ? body.error.message
            : "The PDF could not be prepared. Try again shortly.",
        );
        return;
      }
      setMessage("");
      window.location.assign(body.url);
    } catch {
      setMessage("The PDF could not be prepared. Try again shortly.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.wrap}>
      <a
        className={`button ${buttonClassName}`}
        href={href}
        onClick={download}
        aria-busy={busy}
      >
        {busy ? "Preparing PDF…" : "Download PDF"}
      </a>
      {message && (
        <p className={styles.message} role="status" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}
