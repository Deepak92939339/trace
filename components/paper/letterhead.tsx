import type { ReactNode } from "react";
import { DoubleRule } from "./double-rule";
import styles from "./letterhead.module.css";

export type LetterheadProps = {
  sellerName: string;
  addressLines?: string[];
  /** Seller logo. The page belongs to the seller, not to Trace. */
  logoSrc?: string;
  logoAlt?: string;
  documentType: string;
  documentNumber: string;
  /** Extra right-hand meta lines, e.g. "Revision 3", "Valid until 14 Nov 2026". */
  metaLines?: ReactNode[];
  size?: "md" | "lg";
  className?: string;
};

export function Letterhead({
  sellerName,
  addressLines = [],
  logoSrc,
  logoAlt,
  documentType,
  documentNumber,
  metaLines = [],
  size = "md",
  className,
}: LetterheadProps) {
  return (
    <header
      className={[styles.wrap, styles[size], className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.row}>
        <div className={styles.seller}>
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.logo}
              src={logoSrc}
              alt={logoAlt ?? sellerName}
            />
          ) : null}
          <div className={styles.name}>{sellerName}</div>
          {addressLines.length > 0 ? (
            <address className={styles.address}>
              {addressLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </address>
          ) : null}
        </div>
        <div className={styles.meta}>
          <div className={styles.docType}>{documentType}</div>
          <div className={styles.docNumber}>{documentNumber}</div>
          {metaLines.map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      </div>
      <DoubleRule />
    </header>
  );
}
