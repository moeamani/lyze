import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { listCodes } from "@/server/services/codebook";
import { codeApplicationsOf } from "@/server/services/coding";
import { listMemos } from "@/server/services/memos";
import { can } from "@/lib/permissions";
import { CodebookView } from "@/components/qual/codebook-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("codebook");
  return { title: t("title") };
}

export default async function CodebookPage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/codebook">) {
  const { ws, projectId } = await params;
  const sp = await searchParams;
  const { user, workspace, role, project } = await getProjectContext(ws, projectId);
  const codes = await listCodes(workspace.id, project.id);
  const selected = codes.find((c) => c.id === sp.code) ?? null;
  const [passages, memos] = selected ? await Promise.all([codeApplicationsOf(project.id, selected.id), listMemos(workspace.id, project.id, { targetType: "code", targetId: selected.id })]) : [[], []];
  const strip = <T extends { id: string; name: string; color: string; parentId: string | null; depth: number; path: string[]; definition: string | null; count: number }>(c: T) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    parentId: c.parentId,
    depth: c.depth,
    path: c.path,
    definition: c.definition,
    count: c.count,
  });
  return (
    <CodebookView
      scope={{ workspaceId: workspace.id, slug: workspace.slug, projectId: project.id }}
      base={`/w/${ws}/p/${projectId}`}
      projectId={project.id}
      codes={codes.map(strip)}
      selected={selected ? strip(selected) : null}
      passages={passages.map((p) => ({ id: p.id, quote: p.quote, starred: p.starred, unitId: p.unitId, docKey: p.docKey, source: p.source, who: p.who }))}
      memos={memos.map((m) => ({ id: m.id, title: m.title, body: m.body, authorId: m.authorId, authorName: m.authorName, updatedAt: m.updatedAt.toISOString() }))}
      canEdit={can(role, "content:analyze")}
      currentUserId={user.id}
      role={role}
    />
  );
}
