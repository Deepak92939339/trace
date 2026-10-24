import { workspaceResponse } from "@/lib/studio/workspace-server";
import { studioErrorResponse } from "@/lib/studio/errors";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  try { return await workspaceResponse(request); } catch(error) { return studioErrorResponse(error); }
}
