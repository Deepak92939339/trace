import { handleQuotePdfRequest } from "@/lib/quote-pdf/request-handler";

export const runtime = "nodejs";
// A first render launches a browser; give a serverless host room for it (and for requests that
// wait on another render of the same revision).
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ number: string; revisionNumber: string }> },
) {
  return handleQuotePdfRequest(request, await params);
}
