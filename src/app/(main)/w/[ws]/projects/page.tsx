import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ArchiveIcon } from "lucide-react";
import { getWorkspaceContext } from "@/server/queries/workspace";
import { listGroups, listProjects } from "@/server/services/projects";
import { can } from "@/lib/permissions";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { ProjectBoard } from "@/components/projects/project-board";
import { FoldersIllustration } from "@/components/illustrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects");
  return { title: t("title") };
}

export default async function ProjectsPage({ params, searchParams }: PageProps<"/w/[ws]/projects">) {
  const { ws } = await params;
  const archived = (await searchParams).view === "archived";
  const { workspace, role } = await getWorkspaceContext(ws);
  const t = await getTranslations("projects");
  const [projects, groups] = await Promise.all([listProjects(workspace.id, { archived }), listGroups(workspace.id)]);
  const scope = { workspaceId: workspace.id, slug: workspace.slug };
  const canEdit = can(role, "content:edit");

  return (
    <PageContainer>
      <PageHeader title={t("title")} description={t("subtitle")} actions={canEdit && <NewProjectButton scope={scope} />} />

      <SegmentedNav
        label={t("views")}
        items={[
          { href: `/w/${ws}/projects`, label: t("active"), active: !archived },
          {
            href: `/w/${ws}/projects?view=archived`,
            label: (
              <>
                <ArchiveIcon />
                {t("archivedTab")}
              </>
            ),
            active: archived,
          },
        ]}
      />

      {projects.length === 0 ? (
        archived ? (
          <EmptyState illustration={<FoldersIllustration />} title={t("noArchivedTitle")} description={t("noArchivedBody")} />
        ) : (
          <EmptyState
            illustration={<FoldersIllustration />}
            title={t("emptyTitle")}
            description={canEdit ? t("emptyBody") : t("emptyBodyReadOnly")}
          >
            {canEdit && <NewProjectButton scope={scope} variant="soft" />}
          </EmptyState>
        )
      ) : (
        <ProjectBoard scope={scope} groups={archived ? [] : groups.map((g) => ({ id: g.id, name: g.name }))} projects={projects} canEdit={canEdit && !archived} />
      )}
    </PageContainer>
  );
}
