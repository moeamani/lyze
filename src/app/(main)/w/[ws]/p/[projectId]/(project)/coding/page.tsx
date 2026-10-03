import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { listDocuments, loadDocument } from "@/server/services/qual-docs";
import { codingsForUnits } from "@/server/services/coding";
import { listCodes } from "@/server/services/codebook";
import { listMemos } from "@/server/services/memos";
import { can } from "@/lib/permissions";
import { EmptyState } from "@/components/common/empty-state";
import { ClipboardIllustration } from "@/components/illustrations";
import { CodingWorkspace } from "@/components/qual/coding-workspace";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("coding");
  return { title: t("title") };
}

export default async function CodingPage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/coding">) {
  const { ws, projectId } = await params;
  const sp = await searchParams;
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("coding");
  const docs = await listDocuments(workspace.id, project.id);
  if (!docs.length) return <EmptyState illustration={<ClipboardIllustration />} title={t("emptyTitle")} description={t("emptyBody")} />;

  const summary = docs.find((d) => d.key === sp.doc) ?? docs[0]!;
  const [doc, codes, memos] = await Promise.all([loadDocument(workspace.id, project.id, summary.ref), listCodes(workspace.id, project.id), listMemos(workspace.id, project.id)]);
  const unitKind = doc.units[0]?.kind ?? "segment";
  const unitIds = new Set(doc.units.map((u) => u.id));
  const codings = await codingsForUnits(project.id, unitKind, [...unitIds]);
  const scope = { workspaceId: workspace.id, slug: workspace.slug, projectId: project.id };
  const base = `/w/${ws}/p/${projectId}`;

  return (
    <CodingWorkspace
      scope={scope}
      base={base}
      canCode={can(role, "content:analyze")}
      canEditStudy={can(role, "content:edit")}
      docs={docs.map((d) => ({ key: d.key, title: d.title, subtitle: d.subtitle, studyName: d.studyName, kind: d.kind, units: d.units, codings: d.codings, pending: d.pending }))}
      doc={{
        key: summary.key,
        title: doc.title,
        kind: summary.kind,
        studyName: summary.studyName,
        studyId: doc.studyId,
        sessionId: summary.ref.kind === "session" ? summary.ref.sessionId : null,
        questionId: summary.ref.kind === "question" ? summary.ref.questionId : null,
        href: summary.ref.kind === "session" ? `${base}/s/${doc.studyId}/sessions/${summary.ref.sessionId}` : `${base}/s/${doc.studyId}/results`,
        units: doc.units,
      }}
      codings={codings}
      codes={codes.map((c) => ({ id: c.id, name: c.name, color: c.color, parentId: c.parentId, depth: c.depth, path: c.path, count: c.count, definition: c.definition }))}
      memos={memos.filter((m) => m.targetId && unitIds.has(m.targetId)).map((m) => ({ id: m.id, targetId: m.targetId!, body: m.body, authorName: m.authorName }))}
    />
  );
}
