import Link from "next/link";
import styles from "./public-header.module.css";
import { Brand } from "@/components/ui/brand";

export function PublicHeader() {
  return (
    <header className={`public-header ${styles.header}`}>
      <Brand />
      <nav aria-label="Public navigation" className={styles.nav}>
        <Link href="/#sample-builder">Try the specimen</Link>
        <Link href="/help">Guide</Link>
        <Link href="/whats-new">What&apos;s new</Link>
        <Link href="/sign-in">Reviewer access</Link>
      </nav>
    </header>
  );
}
