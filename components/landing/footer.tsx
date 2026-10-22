import Link from "next/link";
import styles from "./footer.module.css";
export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <p>
        Alpha. Demo data is fictional. Not approved for real personal or
        commercial data.
      </p>
      <nav aria-label="Footer">
        <Link href="#product">Product</Link>
        <Link href="/help">Guide</Link>
        <Link href="/whats-new">What&apos;s new</Link>
      </nav>
    </footer>
  );
}
