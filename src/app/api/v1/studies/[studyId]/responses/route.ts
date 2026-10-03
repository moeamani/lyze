import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { studies } from "@/server/db/schema";
import { loadStudyDataset } from "@/server/services/analysis";
import { exportTable } from "@/lib/exports/table";
import { toCsv } from "@/lib/exports/csv";
import { apiWorkspace } from "../../../auth";

/**
 * GET /api/v1/studies/:id/responses?format=json|csv&labels=1
 * The cleaned dataset (the study's data preparation rules applied), one row per response.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/v1/studies/[studyId]/responses">) {
  const ws = await apiWorkspace(request);
  if (typeof ws !== "string") return ws;
  const { studyId } = await ctx.params;
  const [study] = await db.select({ id: studies.id }).from(studies).where(and(eq(studies.id, studyId), eq(studies.workspaceId, ws))).limit(1);
  if (!study) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const dataset = await loadStudyDataset(ws, studyId);
  const table = exportTable(dataset, request.nextUrl.searchParams.get("labels") === "0" ? "codes" : "labels");
  if (request.nextUrl.searchParams.get("format") === "csv")
    return new NextResponse(toCsv(table.headers, table.rows), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="responses-${studyId}.csv"` } });
  return NextResponse.json({
    variables: dataset.variables.map((v) => ({ name: v.name, label: v.label, measure: v.measure })),
    data: table.rows.map((r) => Object.fromEntries(table.headers.map((h, i) => [h, r[i] ?? null]))),
  });
}
