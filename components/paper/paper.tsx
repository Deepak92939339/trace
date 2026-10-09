import type { ReactNode } from "react";
import styles from "./paper.module.css";

export type PaperProps = {
  as?: "div" | "article" | "section" | "aside";
  padding?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
};

/** Cream surface for anything that IS the record: quotations, proposals, receipts. */
export function Paper({
  as: Tag = "div",
  padding = "md",
  className,
  children,
  ...aria
}: PaperProps) {
  const classes = [styles.paper, styles[padding], className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <Tag className={classes} {...aria}>
      {children}
    </Tag>
  );
}
