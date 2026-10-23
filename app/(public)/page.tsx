import styles from "@/components/landing/landing.module.css";
import { LandingFooter } from "@/components/landing/footer";
import { SampleQuoteBuilder } from "@/components/demo/sample-quote-builder";
import { PublicHeader } from "@/components/marketing/public-header";
import { Hero, ProofCards, LifecycleRow } from "@/components/landing";

export default function LandingPage() {
  return (
    <main
      id="main-content"
      className={`public-shell tender-public ${styles.page}`}
    >
      <PublicHeader />
      <Hero />
      <ProofCards />
      <LifecycleRow />
      <SampleQuoteBuilder />
      <LandingFooter />
    </main>
  );
}
