"use client";
import { Button } from "@/components/ui/button";
export default function StudioErrorPage({ reset }: { reset: () => void }) {
  return (
    <section role="alert">
      <h1>Studio could not load</h1>
      <p>
        Try again. If the problem continues, ask an administrator to check your
        access and the Studio migration.
      </p>
      <Button onClick={reset}>Try again</Button>
    </section>
  );
}
