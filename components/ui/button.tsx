import Link from "next/link";
import React from "react";
import styles from "./button.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  href?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
  onClick?: React.MouseEventHandler<HTMLElement>;
  "aria-label"?: string;
  id?: string;
  tabIndex?: number;
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  href,
  disabled = false,
  children,
  className,
  type = "button",
  onClick,
  "aria-label": ariaLabel,
  id,
  tabIndex,
}: ButtonProps) {
  const isLink = typeof href === "string" && !disabled && !loading;

  const classNames = [
    styles.btn,
    styles[variant],
    styles[size],
    loading ? styles.isLoading : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const spinner = loading ? (
    <span className={styles.spinner} aria-hidden="true" />
  ) : null;

  const content = (
    <>
      <span className={loading ? styles.hiddenContent : undefined}>
        {children}
      </span>
      {spinner}
    </>
  );

  if (isLink) {
    return (
      <Link
        href={href}
        className={classNames}
        aria-label={ariaLabel}
        id={id}
        onClick={onClick as React.MouseEventHandler<HTMLAnchorElement>}
        tabIndex={tabIndex}
      >
        {content}
      </Link>
    );
  }

  if (href && (disabled || loading)) {
    return (
      <a
        role="link"
        aria-disabled={disabled ? "true" : undefined}
        aria-busy={loading ? "true" : undefined}
        className={classNames}
        aria-label={ariaLabel}
        id={id}
        tabIndex={-1}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={loading ? "true" : undefined}
      className={classNames}
      onClick={
        loading
          ? undefined
          : (onClick as React.MouseEventHandler<HTMLButtonElement>)
      }
      aria-label={ariaLabel}
      id={id}
      tabIndex={tabIndex}
    >
      {content}
    </button>
  );
}
