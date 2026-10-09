"use client";

import React from "react";
import Link from "next/link";
import { Kbd } from "@/components/ui/kbd";
import styles from "./top-bar.module.css";

export type BreadcrumbItem = {
  label: React.ReactNode;
  href?: string;
  isCurrent?: boolean;
};

export type TopBarProps = {
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  onSearchClick?: () => void;
  searchPlaceholder?: string;
  className?: string;
};

export function TopBar({
  breadcrumbs = [],
  actions,
  onSearchClick,
  searchPlaceholder = "Search catalog, customers, quotes",
  className,
}: TopBarProps) {
  const topClasses = [styles.top, className ?? ""].filter(Boolean).join(" ");

  return (
    <header className={topClasses}>
      {breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumbs" className={styles.crumb}>
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            const current = item.isCurrent ?? isLast;

            return (
              <React.Fragment key={index}>
                {index > 0 && (
                  <span className={styles.sep} aria-hidden="true">
                    /
                  </span>
                )}
                {current ? (
                  <b aria-current="page">{item.label}</b>
                ) : item.href ? (
                  <Link href={item.href} className={styles.crumbAncestor}>
                    {item.label}
                  </Link>
                ) : (
                  <span className={styles.crumbAncestor}>{item.label}</span>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      <div className={styles.topSpacer} />

      {onSearchClick && (
        <button
          type="button"
          className={styles.search}
          onClick={onSearchClick}
          aria-label="Open command menu"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5L14 14" strokeLinecap="round" />
          </svg>
          <span className={styles.searchText}>{searchPlaceholder}</span>
          <Kbd>⌘K</Kbd>
        </button>
      )}

      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
