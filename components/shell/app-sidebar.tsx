"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "@/components/ui/brand";
import styles from "./app-sidebar.module.css";

export type AppSidebarNavCounts = {
  quotes?: number;
  approvals?: number;
};

export type AppSidebarProps = {
  organizationName: string;
  organizationRole?: string;
  displayName: string;
  roleLabel: string;
  canManageOrganization?: boolean;
  counts?: AppSidebarNavCounts;
  signOutAction: () => Promise<void> | void;
  className?: string;
};

function getInitials(name: string): string {
  if (!name) return "TR";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "TR";
  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }
  const last = parts[parts.length - 1];
  if (!last) return first.slice(0, 2).toUpperCase();
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

export function AppSidebar({
  organizationName,
  organizationRole = "Workspace",
  displayName,
  roleLabel,
  canManageOrganization = false,
  counts,
  signOutAction,
  className,
}: AppSidebarProps) {
  const pathname = usePathname();

  const isCurrent = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  const sidebarClasses = [styles.sidebar, className ?? ""].filter(Boolean).join(" ");

  return (
    <aside className={sidebarClasses} aria-label="Primary">
      {/* Row 1 on mobile: Brand + Org name. On desktop: Brand + Org card */}
      <div className={styles.mobileRow1}>
        <div className={styles.brandWrap}>
          <Brand size="md" />
        </div>
      </div>

      {canManageOrganization ? (
        <Link
          href="/settings/organization"
          className={styles.orgCard}
          aria-label={`Organization: ${organizationName}`}
        >
          <span className={styles.orgIni}>{getInitials(organizationName)}</span>
          <span className={styles.orgTxt}>
            <b>{organizationName}</b>
            <small>{organizationRole}</small>
          </span>
          <svg
            className={styles.orgArrow}
            viewBox="0 0 16 16"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              d="M5 6.5l3 3 3-3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      ) : (
        <div className={styles.orgCard}>
          <span className={styles.orgIni}>{getInitials(organizationName)}</span>
          <span className={styles.orgTxt}>
            <b>{organizationName}</b>
            <small>{organizationRole}</small>
          </span>
        </div>
      )}

      {/* Row 2: "Application" nav */}
      <nav className={styles.sideNav} aria-label="Application">
        <Link
          href="/quotes"
          className={[
            styles.navItem,
            isCurrent("/quotes") ? styles.isActive : "",
          ].join(" ")}
          aria-current={isCurrent("/quotes") ? "page" : undefined}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M5 2.5h6.5L15 6v11.5H5z" strokeLinejoin="round" />
            <path
              d="M11.5 2.5V6H15M7.5 10.5h5M7.5 13.5h3.5"
              strokeLinecap="round"
            />
          </svg>
          <span>Quotes</span>
          {counts?.quotes != null && (
            <span className={styles.navCount}>{counts.quotes}</span>
          )}
        </Link>

        <Link
          href="/approvals"
          className={[
            styles.navItem,
            isCurrent("/approvals") ? styles.isActive : "",
          ].join(" ")}
          aria-current={isCurrent("/approvals") ? "page" : undefined}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="7.25" />
            <path
              d="M6.8 10.3l2.2 2.2 4.2-4.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Approvals</span>
          {counts?.approvals != null && counts.approvals > 0 && (
            <span className={styles.navBadge}>{counts.approvals}</span>
          )}
        </Link>

        <Link
          href="/customers"
          className={[
            styles.navItem,
            isCurrent("/customers") ? styles.isActive : "",
          ].join(" ")}
          aria-current={isCurrent("/customers") ? "page" : undefined}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="8" cy="7" r="2.75" />
            <path
              d="M3 16c.6-2.7 2.4-4.2 5-4.2s4.4 1.5 5 4.2M13.5 4.6a2.5 2.5 0 010 4.8M15 11.9c1.2.5 2 1.8 2.3 3.6"
              strokeLinecap="round"
            />
          </svg>
          <span>Customers</span>
        </Link>

        <Link
          href="/catalog"
          className={[
            styles.navItem,
            isCurrent("/catalog") ? styles.isActive : "",
          ].join(" ")}
          aria-current={isCurrent("/catalog") ? "page" : undefined}
        >
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M10 2.5l7 3.5v8l-7 3.5-7-3.5V6z" strokeLinejoin="round" />
            <path d="M3 6l7 3.5L17 6M10 9.5v8" />
          </svg>
          <span>Catalog</span>
        </Link>
      </nav>

      {/* Row 3 on mobile: Help, What's new, Organization settings, Sign out */}
      <div className={styles.mobileRow3}>
        <Link href="/help" className={styles.utilityLink}>
          Help
        </Link>
        <Link href="/whats-new" className={styles.utilityLink}>
          What&apos;s new
        </Link>
        {canManageOrganization && (
          <Link href="/settings/organization" className={styles.utilityLink}>
            Organization settings
          </Link>
        )}
        <form action={signOutAction} className={styles.signOutForm}>
          <button type="submit" className={styles.signOutBtn}>
            Sign out
          </button>
        </form>
      </div>

      {/* Desktop footer (>= 860px) */}
      <div className={styles.sideFoot}>
        {canManageOrganization && (
          <Link
            href="/settings/organization"
            className={[
              styles.sideLink,
              isCurrent("/settings/organization") ? styles.isActive : "",
            ].join(" ")}
            aria-current={
              isCurrent("/settings/organization") ? "page" : undefined
            }
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M3 6h14M3 14h14" strokeLinecap="round" />
              <circle cx="8" cy="6" r="1.9" fill="currentColor" />
              <circle cx="13" cy="14" r="1.9" fill="currentColor" />
            </svg>
            <span>Organization settings</span>
          </Link>
        )}

        <nav className={styles.supportNav} aria-label="Product support">
          <Link href="/help">Help</Link>
          <Link href="/whats-new">What&apos;s new</Link>
        </nav>

        <div className={styles.me}>
          <span className={styles.meIni}>{getInitials(displayName)}</span>
          <span className={styles.meTxt}>
            <b>{displayName}</b>
            <small>{roleLabel}</small>
          </span>
          <form action={signOutAction} className={styles.signOutForm}>
            <button type="submit" className={styles.signOutBtn}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
