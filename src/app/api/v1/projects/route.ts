import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { projects, studies } from "@/server/db/schema";
import { apiWorkspace } from "../auth";

/** GET /api/v1/projects: projects with their studies. */
export async function GET(request: Request) {
  const ws = await apiWorkspace(request);
  if (typeof ws !== "string") return ws;
  const [ps, ss] = await Promise.all([
    db.select({ id: projects.id, name: projects.name, description: projects.description, archivedAt: projects.archivedAt, updatedAt: projects.updatedAt }).from(projects).where(eq(projects.workspaceId, ws)),
    db.select({ id: studies.id, projectId: studies.projectId, name: studies.name, type: studies.type, status: studies.status }).from(studies).where(eq(studies.workspaceId, ws)),
  ]);
  return NextResponse.json({ data: ps.map((p) => ({ ...p, studies: ss.filter((s) => s.projectId === p.id).map((s) => ({ id: s.id, name: s.name, type: s.type, status: s.status })) })) });
}
