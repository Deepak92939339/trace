import { notFound } from "next/navigation";
import { PortShellPreview } from "../port-shell-preview";

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PortShellPreview />;
}
