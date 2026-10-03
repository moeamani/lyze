import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/server/services/api";

/** Public API: `Authorization: Bearer lyze_…` (Settings → API). Read-only, scoped to the key's workspace. */
export async function apiWorkspace(request: Request): Promise<string | NextResponse> {
  const workspaceId = await authenticateApiKey(request.headers.get("authorization"));
  return workspaceId ?? NextResponse.json({ error: "unauthorized", message: "Send an API key as: Authorization: Bearer lyze_…" }, { status: 401 });
}
