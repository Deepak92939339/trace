import { notFound } from "next/navigation";
import { PortApprovalsPreview } from "../port-approvals-preview";
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PortApprovalsPreview />;
}
