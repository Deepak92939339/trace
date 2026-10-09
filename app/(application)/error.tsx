"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ErrorState } from "@/components/states";

export default function ApplicationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Trace application render failed", error);
  }, [error]);

  return (
    <section className="recovery-page" role="alert">
      <ErrorState
        eyebrow="Workspace interrupted"
        title="Trace could not load this view."
        body="Your data was not changed. Retry once. If it happens again, open the help guide."
        actions={
          <div className="button-row">
            <button
              className="button button-primary"
              type="button"
              onClick={reset}
            >
              Retry this page
            </button>
            <Link className="button" href="/help">
              Open help
            </Link>
            <Link className="button" href="/sign-in">
              Reviewer access
            </Link>
          </div>
        }
        reference={error.digest}
      />
    </section>
  );
}
