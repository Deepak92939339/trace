import React from "react";
import { formatMinor, formatMinorNumber } from "@/lib/formatting/money";
import styles from "./money.module.css";

export type MoneySize = "sm" | "md" | "lg";
export type MoneySigned = "auto" | "always";

export type MoneyProps = {
  minor: number;
  currency: string;
  showCurrency?: boolean;
  signed?: MoneySigned;
  size?: MoneySize;
  locale?: string;
  className?: string;
  id?: string;
};

export function Money({
  minor,
  currency,
  showCurrency = true,
  signed = "auto",
  size = "md",
  locale,
  className,
  id,
}: MoneyProps) {
  const isNegative = minor < 0;
  const absMinor = Math.abs(minor);
  const formatted = showCurrency
    ? locale
      ? formatMinor(absMinor, currency, locale)
      : formatMinor(absMinor, currency)
    : locale
      ? formatMinorNumber(absMinor, currency, locale)
      : formatMinorNumber(absMinor, currency);

  let output = formatted;
  if (isNegative) {
    output = `\u2212${formatted}`;
  } else if (signed === "always" && minor > 0) {
    output = `+${formatted}`;
  }

  const classNames = [
    styles.money,
    styles[size],
    isNegative ? styles.negative : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classNames} id={id}>
      {output}
    </span>
  );
}
