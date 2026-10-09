import styles from "./double-rule.module.css";

/** One ink line plus one 35% ink line, 3px apart. Sits under every letterhead. */
export function DoubleRule({ className }: { className?: string }) {
  return (
    <div
      role="presentation"
      className={[styles.rule, className ?? ""].filter(Boolean).join(" ")}
    />
  );
}
