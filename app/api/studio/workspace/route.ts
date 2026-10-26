import { workspaceResponse } from "@/lib/studio/workspace-server";
import { studioErrorResponse } from "@/lib/studio/errors";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (request.headers.get("next-router-prefetch") || request.headers.get("rsc"))
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    }); // a prefetch must never pin, render or spend the export slot
  try {
    return await workspaceResponse(request);
  } catch (error) {
    return studioErrorResponse(error);
  }
}
