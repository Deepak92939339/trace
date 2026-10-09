import Link from "next/link";
import { Brand } from "@/components/ui/brand";
import { ErrorState } from "@/components/states";

export default function NotFound() {
  return (
    <main id="main-content" className="not-found">
      <Brand />
      <ErrorState
        eyebrow="404"
        title="This page is not part of Trace."
        body="The address may be old or incomplete."
        actions={
          <Link className="button" href="/">
            Return home
          </Link>
        }
      />
    </main>
  );
}
