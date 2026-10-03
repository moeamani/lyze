import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { listCodes } from "@/server/services/codebook";
import { listThemes } from "@/server/services/themes";
import { assistantName } from "@/server/services/ai-settings";
import { can } from "@/lib/permissions";
import { ThemeBoard } from "@/components/qual/theme-board";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("themes");
  return { title: t("title") };
}

export default async function ThemesPage({ params }: PageProps<"/w/[ws]/p/[projectId]/themes">) {
  const { ws, projectId } = await params;
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const [themes, codes] = await Promise.all([listThemes(workspace.id, project.id), listCodes(workspace.id, project.id)]);
  return (
    <ThemeBoard
      scope={{ workspaceId: workspace.id, slug: workspace.slug, projectId: project.id }}
      base={`/w/${ws}/p/${projectId}`}
      themes={themes.map((t) => ({ id: t.id, name: t.name, description: t.description, color: t.color }))}
      codes={codes.map((c) => ({ id: c.id, name: c.name, color: c.color, count: c.count, themeId: c.themeId, themePosition: c.themePosition, path: c.path }))}
      canEdit={can(role, "content:analyze")}
      assistant={await assistantName(workspace.id)}
    />
  );
}
