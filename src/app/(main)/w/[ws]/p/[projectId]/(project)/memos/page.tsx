import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { listMemos, memoTargets } from "@/server/services/memos";
import { can } from "@/lib/permissions";
import { MemoList } from "@/components/qual/memo-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("memos");
  return { title: t("title") };
}

export default async function MemosPage({ params }: PageProps<"/w/[ws]/p/[projectId]/memos">) {
  const { ws, projectId } = await params;
  const { user, workspace, role, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("memos");
  const memos = await listMemos(workspace.id, project.id);
  const targets = await memoTargets(project.id, memos);
  const base = `/w/${ws}/p/${projectId}`;
  const linkFor = (id: string) => {
    const x = targets.get(id);
    if (!x) return null;
    if (x.kind === "code") return { href: `${base}/codebook?code=${x.codeId}`, label: t("onCode", { name: x.label }) };
    if (x.kind === "theme") return { href: `${base}/themes`, label: t("onTheme", { name: x.label }) };
    if (x.kind === "session") return { href: `${base}/s/${x.studyId}/sessions/${x.sessionId}`, label: t("onSession", { name: x.label }) };
    return { href: `${base}/coding?doc=${encodeURIComponent(x.docKey!)}#u-${x.unitId}`, label: x.kind === "segment" ? t("onPassage", { name: x.label }) : t("onAnswer") };
  };
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <MemoList
        scope={{ workspaceId: workspace.id, slug: workspace.slug, projectId: project.id }}
        target={{ targetType: "project" }}
        title={t("all", { count: memos.length })}
        showTitles
        canWrite={can(role, "content:analyze")}
        currentUserId={user.id}
        role={role}
        memos={memos.map((m) => ({ id: m.id, title: m.title, body: m.body, authorId: m.authorId, authorName: m.authorName, updatedAt: m.updatedAt.toISOString(), link: m.targetType === "project" ? null : linkFor(m.id) }))}
      />
    </div>
  );
}
