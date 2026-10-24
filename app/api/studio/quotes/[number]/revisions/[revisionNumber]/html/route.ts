import { issuedHtml } from "@/lib/studio/issued-document";
import { studioErrorResponse } from "@/lib/studio/errors";
export const runtime = "nodejs";
export async function GET(request: Request,{params}:{params:Promise<{number:string;revisionNumber:string}>}) {
  if (request.headers.get("next-router-prefetch") || request.headers.get("rsc")) return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }); // a prefetch must never pin, render or spend the export slot
  try {
    const result = await issuedHtml(await params);
    const disposition=new URL(request.url).searchParams.get("view")==="print"?"inline":"attachment";
    return new Response(result.html,{headers:{"Content-Type":"text/html; charset=utf-8","Content-Disposition":`${disposition}; filename="${result.filename}"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; sandbox"}});
  } catch(error) { return studioErrorResponse(error); }
}
