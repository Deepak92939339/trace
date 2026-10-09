"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import styles from "./command-palette.module.css";

export type CommandItem = {
  id: string;
  label: string;
  detail?: string;
  badge?: string;
  meta?: string;
  icon?: React.ReactNode;
  onSelect?: () => void;
  href?: string;
};

export type CommandGroup = {
  name: string;
  items: CommandItem[];
};

export type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onToggle?: () => void;
  groups?: CommandGroup[];
  query?: string;
  onQueryChange?: (query: string) => void;
  placeholder?: string;
  onSelect?: (item: CommandItem) => void;
  enableGlobalShortcut?: boolean;
};

export function CommandPalette({
  open,
  onClose,
  onToggle,
  groups = [],
  query: controlledQuery,
  onQueryChange,
  placeholder = "Search quotes, customers, catalog...",
  onSelect,
  enableGlobalShortcut = true,
}: CommandPaletteProps) {
  const [internalQuery, setInternalQuery] = useState("");
  const isControlled = controlledQuery !== undefined;
  const currentQuery = isControlled ? controlledQuery : internalQuery;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const listboxId = useId();

  // Filter groups if query is non-empty
  const filteredGroups = useMemo(() => {
    const q = currentQuery.trim().toLowerCase();
    if (!q) return groups;

    return groups
      .map((group) => {
        const filteredItems = group.items.filter((item) => {
          const matchLabel = item.label.toLowerCase().includes(q);
          const matchDetail = item.detail?.toLowerCase().includes(q) ?? false;
          const matchMeta = item.meta?.toLowerCase().includes(q) ?? false;
          const matchBadge = item.badge?.toLowerCase().includes(q) ?? false;
          return matchLabel || matchDetail || matchMeta || matchBadge;
        });
        return {
          ...group,
          items: filteredItems,
        };
      })
      .filter((group) => group.items.length > 0);
  }, [groups, currentQuery]);

  const flatItems = useMemo(() => {
    return filteredGroups.flatMap((group) => group.items);
  }, [filteredGroups]);

  const [prevQuery, setPrevQuery] = useState(currentQuery);
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (prevQuery !== currentQuery) {
    setPrevQuery(currentQuery);
    setSelectedIndex(0);
  }

  const safeIndex =
    flatItems.length > 0
      ? (selectedIndex % flatItems.length + flatItems.length) %
        flatItems.length
      : 0;

  // Global ⌘K / Ctrl+K listener
  useEffect(() => {
    if (!enableGlobalShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) {
          onClose();
        } else if (onToggle) {
          onToggle();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, onToggle, enableGlobalShortcut]);

  // Modal lifecycle & focus restoration
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (document.activeElement instanceof HTMLElement) {
        triggerRef.current = document.activeElement;
      }
      if (!dialog.open) {
        dialog.showModal();
      }
      inputRef.current?.focus();
    } else {
      if (dialog.open) {
        dialog.close();
      }
      if (triggerRef.current && document.contains(triggerRef.current)) {
        triggerRef.current.focus();
      }
    }
  }, [open]);

  const handleSelect = (item: CommandItem) => {
    item.onSelect?.();
    onSelect?.(item);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (flatItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatItems.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const currentItem = flatItems[safeIndex];
      if (currentItem) {
        handleSelect(currentItem);
      }
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!isControlled) {
      setInternalQuery(val);
    }
    onQueryChange?.(val);
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      aria-label="Command palette"
    >
      <div className={styles.inputWrap}>
        <svg
          className={styles.searchIcon}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={currentQuery}
          onChange={handleQueryChange}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label="Search Trace"
        />
        <Kbd>Esc</Kbd>
      </div>

      <div className={styles.results} id={listboxId} role="listbox">
        {filteredGroups.length === 0 ? (
          <div className={styles.empty}>No matching commands or records found</div>
        ) : (
          filteredGroups.map((group) => (
            <div key={group.name} className={styles.group}>
              <div className={styles.groupTitle}>{group.name}</div>
              <ul className={styles.list}>
                {group.items.map((item) => {
                  const itemIndex = flatItems.indexOf(item);
                  const isSelected = itemIndex === safeIndex;

                  return (
                    <li
                      key={item.id}
                      role="option"
                      aria-selected={isSelected}
                      className={[
                        styles.item,
                        isSelected ? styles.isSelected : "",
                      ].join(" ")}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setSelectedIndex(itemIndex)}
                    >
                      {item.icon && (
                        <span className={styles.itemIcon}>{item.icon}</span>
                      )}
                      <div className={styles.itemContent}>
                        <span className={styles.itemLabel}>{item.label}</span>
                        {item.detail && (
                          <span className={styles.itemDetail}>
                            {item.detail}
                          </span>
                        )}
                      </div>
                      {(item.badge || item.meta) && (
                        <div className={styles.itemMeta}>
                          {item.badge && <Kbd>{item.badge}</Kbd>}
                          {item.meta && <span>{item.meta}</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.keys}>
          <span className={styles.keyHint}>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate
          </span>
          <span className={styles.keyHint}>
            <Kbd>↵</Kbd> select
          </span>
        </div>
        <span className={styles.keyHint}>
          <Kbd>esc</Kbd> close
        </span>
      </div>
    </dialog>
  );
}
