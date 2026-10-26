"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  LeaveGuardProvider,
  requestSignOut,
  useHasLeaveGuardProvider,
} from "@/components/studio/leave-guard-provider";
import Link from "next/link";
import styles from "./profile-menu.module.css";
export type ProfileMenuProps = {
  displayName: string;
  roleLabel: string;
  organizationName: string;
  canReadStudio: boolean;
  canExport: boolean;
  signOutAction: () => void | Promise<void>;
  /** Shared post-guard dialog slot. Sandbox calls proceed only after its warning/choice. */
  beforeSignOut?: (slot: {
    proceed: () => void | Promise<void>;
    close: () => void;
  }) => ReactNode;
};
export function ProfileMenu(props: ProfileMenuProps) {
  const inScope = useHasLeaveGuardProvider();
  return inScope ? (
    <ProfileMenuContent {...props} />
  ) : (
    <LeaveGuardProvider
      signOutAction={props.signOutAction}
      beforeSignOut={props.beforeSignOut}
    >
      <ProfileMenuContent {...props} />
    </LeaveGuardProvider>
  );
}
function ProfileMenuContent({
  displayName,
  roleLabel,
  organizationName,
  canReadStudio,
  canExport,
}: ProfileMenuProps) {
  const [open, setOpen] = useState(false),
    id = useId(),
    trigger = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    root = useRef<HTMLDivElement>(null);
  const initials =
    displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0])
      .join("")
      .toUpperCase() || "TR";
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div ref={root} className={styles.root}>
      <button
        ref={trigger}
        type="button"
        className={styles.avatar}
        data-profile-trigger
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {initials}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="menu"
          aria-label="Profile"
          className={styles.menu}
          onKeyDown={(e) => {
            const items = Array.from(
              panel.current?.querySelectorAll<HTMLElement>(
                '[role="menuitem"]:not(:disabled)',
              ) ?? [],
            );
            const index = items.indexOf(document.activeElement as HTMLElement);
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)
            ) {
              e.preventDefault();
              const at =
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? items.length - 1
                    : (index + (e.key === "ArrowDown" ? 1 : items.length - 1)) %
                      items.length;
              items[at]?.focus();
            } else if (e.key === "Tab") setOpen(false);
          }}
        >
          <div className={styles.identity}>
            <strong>{displayName}</strong>
            <span>{roleLabel}</span>
            <small>{organizationName}</small>
          </div>
          {canReadStudio && (
            <Link role="menuitem" tabIndex={-1} href="/studio" onClick={close}>
              Studio
            </Link>
          )}
          {canExport && (
            <a
              role="menuitem"
              tabIndex={-1}
              href="/api/studio/workspace"
              onClick={close}
            >
              Export workspace
            </a>
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              close();
              void requestSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
