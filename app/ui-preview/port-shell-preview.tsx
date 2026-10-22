"use client";

import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import styles from "@/components/application/app-shell.module.css";

export function PortShellPreview() {
  return (
    <div className={styles.app}>
      <AppSidebar
        organizationName="Northline Fabrication Ltd"
        displayName="Meera Kapoor"
        roleLabel="Commercial reviewer"
        counts={{ quotes: 24, approvals: 3 }}
        signOutAction={() => {}}
      />
      <div className={styles.main}>
        <TopBar
          breadcrumbs={[
            { label: "Quotes", href: "/quotes" },
            { label: "Approvals" },
          ]}
          onSearchClick={() => {}}
        />
        <main id="main-content" className={styles.appMain}>
          <PageHeader
            title="Approvals"
            subtitle="Fixture-only shell preview · long organization and user names"
            rightSlot={<Button href="/ui-preview">All previews</Button>}
          />
        </main>
      </div>
    </div>
  );
}
