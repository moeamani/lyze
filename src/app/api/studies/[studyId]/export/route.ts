import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { currentUser } from "@/server/auth";
import { db } from "@/server/db";
import { studies } from "@/server/db/schema";
import { requireWorkspace } from "@/server/services/access";
import { isAppError } from "@/server/services/errors";
import { recordAudit } from "@/server/services/audit";
import { loadStudyDataset } from "@/server/services/analysis";
import { codebook, exportTable } from "@/lib/exports/table";
import { toCsv } from "@/lib/exports/csv";
import { toXlsx } from "@/lib/exports/xlsx";
import { writeSav } from "@/lib/exports/sav";
import { rScript } from "@/lib/exports/r";
import { writeQdpx } from "@/lib/exports/qdpx";
import { slugify } from "@/lib/slug";
import { EXPORT_FORMATS, type ExportFormat as Format } from "@/lib/exports/formats";


/** Download a study's cleaned dataset in research-software formats. Workspace members only. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/studies/[studyId]/export">) {
  const user = await currentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const { studyId } = await ctx.params;
  const format = request.nextUrl.searchParams.get("format") as Format | null;
  if (!format || !EXPORT_FORMATS.includes(format)) return new NextResponse("Unknown format", { status: 400 });

  const [study] = await db.select().from(studies).where(eq(studies.id, studyId)).limit(1);
  if (!study) return new NextResponse("Not found", { status: 404 });
  try {
    await requireWorkspace(user.id, study.workspaceId, "workspace:view");
  } catch (e) {
    if (isAppError(e)) return new NextResponse("Not found", { status: 404 });
    throw e;
  }

  const dataset = await loadStudyDataset(study.workspaceId, study.id);
  const base = `${slugify(study.name)}-${new Date().toISOString().slice(0, 10)}`;
  const now = new Date();

  let body: Uint8Array | string;
  let type: string;
  let filename: string;
  switch (format) {
    case "csv":
    case "csv-codes": {
      const t = exportTable(dataset, format === "csv" ? "labels" : "codes");
      body = toCsv(t.headers, t.rows);
      type = "text/csv; charset=utf-8";
      filename = `${base}${format === "csv-codes" ? "-codes" : ""}.csv`;
      break;
    }
    case "xlsx":
      body = toXlsx([
        { name: "Responses", ...exportTable(dataset, "labels") },
        { name: "Codes", ...exportTable(dataset, "codes") },
        { name: "Variables", ...codebook(dataset.variables) },
      ]);
      type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      filename = `${base}.xlsx`;
      break;
    case "sav":
      body = writeSav(dataset, { label: study.name, now });
      type = "application/x-spss-sav";
      filename = `${base}.sav`;
      break;
    case "r": {
      const codes = exportTable(dataset, "codes");
      const cb = codebook(dataset.variables);
      body = zipSync({
        "data.csv": strToU8(toCsv(codes.headers, codes.rows)),
        "codebook.csv": strToU8(toCsv(cb.headers, cb.rows)),
        "data.sav": writeSav(dataset, { label: study.name, now }),
        "lyze_import.R": strToU8(rScript(dataset, { title: study.name, generatedAt: now })),
        "README.txt": strToU8(
          `${study.name}\nExported from Lyze on ${now.toISOString()}\n\n` +
            `In R:   source("lyze_import.R")   # creates the data frame \`lyze\`\n` +
            `Or:     haven::read_sav("data.sav") for SPSS-style labelled data\n\n` +
            `data.csv     numeric codes, one row per response\ncodebook.csv variable names, labels, measurement levels and value labels\n`,
        ),
      });
      type = "application/zip";
      filename = `${base}-r.zip`;
      break;
    }
    case "qdpx":
    case "qdpx-maxqda":
      body = writeQdpx(dataset, {
        projectName: study.name,
        userName: user.name || user.email,
        now,
        lineEndings: format === "qdpx-maxqda" ? "crlf" : "lf",
        description: study.description ?? undefined,
      });
      type = "application/zip";
      filename = `${base}${format === "qdpx-maxqda" ? "-maxqda" : ""}.qdpx`;
      break;
  }

  await recordAudit(db, {
    workspaceId: study.workspaceId,
    actorId: user.id,
    action: "data.exported",
    entityType: "study",
    entityId: study.id,
    metadata: { name: study.name, format, rows: dataset.rows.length },
  });

  return new NextResponse(body as BodyInit, {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
