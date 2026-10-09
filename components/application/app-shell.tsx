"use client";

import React, { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar, type BreadcrumbItem } from "@/components/shell/top-bar";
import {
  CommandPalette,
  type CommandGroup,
} from "@/components/shell/command-palette";
import { ReviewerBanner } from "@/components/states";
import styles from "./app-shell.module.css";

type ShellContext = {
  canManageOrganization: boolean;
  displayName: string;
  roleLabel: string;
  organizationName: string;
  readOnly: boolean;
};

export function AppShell({
  context,
  children,
}: {
  context: ShellContext;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Generate breadcrumb items from current path
  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    if (!pathname) return [{ label: "Quotes", isCurrent: true }];

    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      return [{ label: "Quotes", isCurrent: true }];
    }

    const first = segments[0];
    if (!first) {
      return [{ label: "Quotes", isCurrent: true }];
    }
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    if (first === "quotes") {
      if (segments.length === 1) {
        return [{ label: "Quotes", isCurrent: true }];
      }
      if (segments[1] === "new") {
        return [
          { label: "Quotes", href: "/quotes" },
          { label: "New quote", isCurrent: true },
        ];
      }
      return [
        { label: "Quotes", href: "/quotes" },
        { label: "Quote", isCurrent: true },
      ];
    }

    if (first === "settings") {
      return [
        { label: "Settings", href: "/settings/organization" },
        { label: capitalize(segments[1] || "Organization"), isCurrent: true },
      ];
    }

    if (segments.length === 1) {
      return [{ label: capitalize(first), isCurrent: true }];
    }

    return [
      { label: capitalize(first), href: `/${first}` },
      { label: segments.slice(1).join("/"), isCurrent: true },
    ];
  }, [pathname]);

  const router = useRouter();

  const commandGroups = useMemo<CommandGroup[]>(() => {
    return [
      {
        name: "Navigation",
        items: [
          {
            id: "nav-quotes",
            label: "Quotes",
            detail: "View all quotations",
            href: "/quotes",
            onSelect: () => router.push("/quotes"),
          },
          {
            id: "nav-new-quote",
            label: "Prepare the offer",
            detail: "Create a new quotation",
            href: "/quotes/new",
            onSelect: () => router.push("/quotes/new"),
          },
          {
            id: "nav-approvals",
            label: "Approvals",
            detail: "Commercial review queue",
            href: "/approvals",
            onSelect: () => router.push("/approvals"),
          },
          {
            id: "nav-customers",
            label: "Customers",
            detail: "Directory of commercial clients",
            href: "/customers",
            onSelect: () => router.push("/customers"),
          },
          {
            id: "nav-catalog",
            label: "Catalog",
            detail: "Standard line items and rates",
            href: "/catalog",
            onSelect: () => router.push("/catalog"),
          },
          ...(context.canManageOrganization
            ? [
                {
                  id: "nav-org-settings",
                  label: "Organization settings",
                  detail: "Manage tenant configuration",
                  href: "/settings/organization",
                  onSelect: () => router.push("/settings/organization"),
                },
              ]
            : []),
        ],
      },
      {
        name: "Support",
        items: [
          {
            id: "support-help",
            label: "Documentation and guides",
            href: "/help",
            onSelect: () => router.push("/help"),
          },
          {
            id: "support-whats-new",
            label: "What's new",
            href: "/whats-new",
            onSelect: () => router.push("/whats-new"),
          },
        ],
      },
    ];
  }, [context.canManageOrganization, router]);

  return (
    <div className={styles.app}>
      <AppSidebar
        organizationName={context.organizationName}
        displayName={context.displayName}
        roleLabel={context.roleLabel}
        canManageOrganization={context.canManageOrganization}
        signOutAction={signOut}
      />

      <div className={styles.main}>
        {context.readOnly && <ReviewerBanner />}
        <TopBar
          breadcrumbs={breadcrumbs}
          onSearchClick={() => setPaletteOpen(true)}
        />
        <main id="main-content" className={`app-main ${styles.appMain}`}>
          {children}
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onToggle={() => setPaletteOpen((prev) => !prev)}
        groups={commandGroups}
      />
    </div>
  );
}
