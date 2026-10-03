import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/auth";
import { db } from "@/server/db";
import { isAppError } from "@/server/services/errors";
import { recordAudit } from "@/server/services/audit";
import { requireProjectById } from "@/server/services/qual-docs";
import { exportCodebook } from "@/server/services/codebook";
import { buildProjectQdpx, quotesCsv } from "@/server/services/qual-export";
import { slugify } from "@/lib/slug";

const FORMATS = ["qdpx", "qdpx-maxqda", "qdc", "quotes"] as const;
type Format = (typeof FORMATS)[number];

/** Qualitative exports for a project: REFI-QDA project / codebook, and the quote bank as CSV. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/export">) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const format = request.nextUrl.searchParams.get("format") as Format | null;
  if (!format || !FORMATS.includes(format)) return new NextResponse("Unknown format", { status: 400 });
  const { projectId } = await ctx.params;
  try {
    const { project, workspace } = await requireProjectById(user.id, projectId);
    const base = `${slugify(project.name) || "project"}-${new Date().toISOString().slice(0, 10)}`;
    let body: BodyInit;
    let type: string;
    let name: string;
    if (format === "qdc") {
      body = await exportCodebook(workspace.id, project.id);
      type = "application/xml; charset=utf-8";
      name = `${base}-codebook.qdc`;
    } else if (format === "quotes") {
      const starred = request.nextUrl.searchParams.get("starred") === "1";
      body = await quotesCsv(workspace.id, project.id, { starred: starred || undefined, codeId: request.nextUrl.searchParams.get("code") });
      type = "text/csv; charset=utf-8";
      name = `${base}-quotes.csv`;
    } else {
      body = (await buildProjectQdpx(workspace.id, project.id, { projectName: project.name, userName: user.name ?? user.handle, lineEndings: format === "qdpx-maxqda" ? "crlf" : "lf" })) as BodyInit;
      type = "application/zip";
      name = `${base}${format === "qdpx-maxqda" ? "-maxqda" : ""}.qdpx`;
    }
    await recordAudit(db, { workspaceId: workspace.id, actorId: user.id, action: "data.exported", entityType: "project", entityId: project.id, metadata: { name: project.name, format } });
    return new NextResponse(body, {
      headers: { "content-type": type, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "private, no-store" },
    });
  } catch (error) {
    if (isAppError(error)) return new NextResponse("Not found", { status: 404 });
    throw error;
  }
}
