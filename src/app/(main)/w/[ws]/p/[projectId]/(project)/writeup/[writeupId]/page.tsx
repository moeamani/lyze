import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { getWriteup } from "@/server/services/writeup";
import { can } from "@/lib/permissions";
import { WriteupView } from "@/components/writeup/writeup-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("writeup");
  return { title: t("title") };
}

export default async function WriteupDetail({ params }: PageProps<"/w/[ws]/p/[projectId]/writeup/[writeupId]">) {
  const { ws, projectId, writeupId } = await params;
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const w = await getWriteup(workspace.id, project.id, writeupId);
  return (
    <WriteupView
      scope={{ workspaceId: workspace.id, slug: workspace.slug, projectId: project.id }}
      back={`/w/${ws}/p/${projectId}/writeup`}
      writeup={{ id: w.id, title: w.title, body: w.body, provider: w.provider, createdAt: w.createdAt.toISOString() }}
      canEdit={can(role, "content:analyze")}
    />
  );
}
