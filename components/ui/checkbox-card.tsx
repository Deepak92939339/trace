"use client";

import React from "react";
import styles from "./checkbox-card.module.css";

export type CheckboxCardProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  price?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
};

export function CheckboxCard({
  checked,
  onChange,
  title,
  description,
  price,
  disabled = false,
  id,
  className,
}: CheckboxCardProps) {
  const handleClick = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const classNames = [
    styles.card,
    checked ? styles.checked : "",
    disabled ? styles.disabled : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      role="checkbox"
      aria-checked={checked}
      aria-disabled={disabled ? "true" : undefined}
      tabIndex={disabled ? -1 : 0}
      id={id}
      className={classNames}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.box} aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="none" className={styles.checkIcon}>
          <path
            d="M3.5 8.5l3 3 6-6.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className={styles.txt}>
        <span className={styles.title}>{title}</span>
        {description && (
          <span className={styles.description}>{description}</span>
        )}
      </span>
      {price && <span className={styles.price}>{price}</span>}
    </div>
  );
}
