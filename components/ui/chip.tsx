import React from "react";
import styles from "./chip.module.css";

export type ChipTone = "neutral" | "amber" | "red" | "green" | "rev";

export type ChipProps = {
  children: React.ReactNode;
  tone?: ChipTone;
  className?: string;
  id?: string;
};

export function Chip({
  children,
  tone = "neutral",
  className,
  id,
}: ChipProps) {
  const classNames = [styles.chip, styles[tone], className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classNames} id={id}>
      {children}
    </span>
  );
}
