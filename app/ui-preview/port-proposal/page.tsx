import { notFound } from "next/navigation";
import { PortProposalPreview } from "../port-proposal-preview";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PortProposalPreview />;
}
