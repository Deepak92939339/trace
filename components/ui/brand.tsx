import Link from "next/link";
import styles from "./brand.module.css";

export type BrandProps = {
  size?: "sm" | "md";
  muted?: boolean;
  href?: string;
  className?: string;
};

export function Brand({
  size = "md",
  muted = false,
  href = "/",
  className,
}: BrandProps = {}) {
  const content = (
    <>
      <svg
        viewBox="0 0 20 12"
        aria-hidden="true"
        className={styles.mark}
        fill="none"
      >
        <path
          d="M0 6h5.5M14.5 6H20"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <rect
          x="6"
          y="1.8"
          width="8"
          height="8.4"
          rx="1.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
      </svg>
      <span className={styles.word}>Trace</span>
    </>
  );

  const classes = [
    "brand",
    styles.brand,
    size === "sm" ? styles.sm : styles.md,
    muted ? styles.muted : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <Link className={classes} href={href} aria-label="Trace home">
        {content}
      </Link>
    );
  }

  return (
    <span className={classes}>
      {content}
    </span>
  );
}
