import { SampleQuoteBuilder } from "@/components/demo/sample-quote-builder";
import { PublicHeader } from "@/components/marketing/public-header";
import { Hero, ProofCards, LifecycleRow } from "@/components/landing";

export default function LandingPage() {
  return (
    <main id="main-content" className="public-shell tender-public">
      <PublicHeader />
      <Hero />
      <ProofCards />
      <LifecycleRow />
      <SampleQuoteBuilder />
    </main>
  );
}
