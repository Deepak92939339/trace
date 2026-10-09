"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ErrorState,
  ConflictBanner,
  ExpiredNotice,
  ReviewerBanner,
  ReadOnlyNotice,
  Skeleton,
} from "@/components/states";
import styles from "./ui-preview.module.css";

export function B9Preview() {
  return (
    <section className={styles.section} id="b9-states" aria-labelledby="b9-title">
      <h2 id="b9-title" className={styles.sectionTitle}>
        <span>System States &amp; Notices (Batch B9)</span>
        <span className={styles.sectionHint}>
          EmptyState · ErrorState · ConflictBanner · ExpiredNotice · ReviewerBanner · Skeleton
        </span>
      </h2>

      {/* 1. Empty States */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className={styles.label}>1. EmptyState — Check, Search, and Inbox variants</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            background: "var(--canvas)",
            padding: 16,
            borderRadius: "var(--r-panel, 8px)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--r-ctl, 6px)",
              border: "1px solid var(--line)",
            }}
          >
            <EmptyState
              icon="check"
              title="No quotations are waiting for approval."
              hint="All commercial proposals have been approved."
            />
          </div>
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--r-ctl, 6px)",
              border: "1px solid var(--line)",
            }}
          >
            <EmptyState
              icon="search"
              title="No catalog products match this view."
              hint="Try clearing or adjusting search filters."
            />
          </div>
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--r-ctl, 6px)",
              border: "1px solid var(--line)",
            }}
          >
            <EmptyState
              icon="inbox"
              title="No quotations yet. Create a draft to begin the commercial record."
              action={{ label: "Create quote", href: "/quotes/new" }}
            />
          </div>
        </div>
      </div>

      {/* 2. Error States */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className={styles.label}>2. ErrorState — Interrupted view and 404 not found</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
            background: "var(--canvas)",
            padding: 16,
            borderRadius: "var(--r-panel, 8px)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--r-ctl, 6px)",
              border: "1px solid var(--line)",
              padding: 20,
            }}
          >
            <ErrorState
              eyebrow="Workspace interrupted"
              title="Trace could not load this view."
              body="Your data was not changed. Retry once. If it happens again, open the help guide."
              actions={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button variant="primary" size="sm" type="button">
                    Retry this page
                  </Button>
                  <Button variant="secondary" size="sm" href="/help">
                    Open help
                  </Button>
                  <Button variant="secondary" size="sm" href="/sign-in">
                    Reviewer access
                  </Button>
                </div>
              }
              reference="err_9f82d1c7a4"
            />
          </div>
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "var(--r-ctl, 6px)",
              border: "1px solid var(--line)",
              padding: 20,
            }}
          >
            <ErrorState
              eyebrow="404"
              title="This page is not part of Trace."
              body="The address may be old or incomplete."
              actions={
                <Link className="button" href="/">
                  Return home
                </Link>
              }
            />
          </div>
        </div>
      </div>

      {/* 3. Conflict Banner */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className={styles.label}>3. ConflictBanner — Concurrency status banner</div>
        <ConflictBanner
          title="Concurrent revision detected"
          body="Revision 2 was saved with newer line items in another session. Reload before making further adjustments."
          action={
            <Button variant="secondary" size="sm" type="button">
              Reload revision
            </Button>
          }
        />
      </div>

      {/* 4. Expired Notices */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className={styles.label}>4. ExpiredNotice — Expired and Closed tones</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 16,
          }}
        >
          <ExpiredNotice
            tone="expired"
            title="Quotation unavailable"
            body="This quotation has expired and can no longer be accepted. Contact the seller for an updated proposal."
          />
          <ExpiredNotice
            tone="closed"
            title="Quotation unavailable"
            body="This quotation has already been accepted and the agreement is recorded on the permanent commercial ledger."
          />
        </div>
      </div>

      {/* 5. Reviewer Banner & Read-Only Notice */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className={styles.label}>5. ReviewerBanner &amp; ReadOnlyNotice</div>
        <div
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--r-panel, 8px)",
            overflow: "hidden",
            background: "var(--surface)",
          }}
        >
          <ReviewerBanner />
          <div style={{ padding: 16 }}>
            <ReadOnlyNotice>
              Your explicit capability map does not grant access to organization settings.
            </ReadOnlyNotice>
          </div>
        </div>
      </div>

      {/* 6. Skeletons */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className={styles.label}>6. Skeleton — Page, Table, and Document variants</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div className={styles.sectionHint} style={{ marginBottom: 8 }}>
              variant=&quot;table&quot; (rows=3)
            </div>
            <Skeleton variant="table" rows={3} />
          </div>

          <div>
            <div className={styles.sectionHint} style={{ marginBottom: 8 }}>
              variant=&quot;document&quot; (rows=2)
            </div>
            <Skeleton variant="document" rows={2} />
          </div>

          <div>
            <div className={styles.sectionHint} style={{ marginBottom: 8 }}>
              variant=&quot;page&quot;
            </div>
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--r-panel, 8px)",
                padding: 16,
                background: "var(--surface)",
              }}
            >
              <Skeleton variant="page" rows={2} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
