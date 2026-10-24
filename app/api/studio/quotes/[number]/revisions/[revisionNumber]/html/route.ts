import { issuedHtml } from "@/lib/studio/issued-document";
import { studioErrorResponse } from "@/lib/studio/errors";
export const runtime = "nodejs";
export async function GET(_request: Request,{params}:{params:Promise<{number:string;revisionNumber:string}>}) {
  try {
    const result = await issuedHtml(await params);
    return new Response(result.html,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Disposition":`attachment; filename="${result.filename}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; sandbox"}});
  } catch(error) { return studioErrorResponse(error); }
}
