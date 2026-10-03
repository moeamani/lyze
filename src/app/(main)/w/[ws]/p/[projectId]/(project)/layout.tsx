import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { Swatch } from "@/components/common/swatch";
import { ProjectActions } from "@/components/projects/project-actions";
import { NewStudyButton } from "@/components/studies/study-dialog";
import { ProjectTabs } from "@/components/qual/project-tabs";

/** A project: its studies, and the qualitative analysis that spans them. */
export default async function ProjectLayout({ children, params }: LayoutProps<"/w/[ws]/p/[projectId]">) {
  const { ws, projectId } = await params;
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("projects");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const canEdit = can(role, "content:edit");
  const scope = { workspaceId: workspace.id, slug: workspace.slug, projectId: project.id };

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <Breadcrumbs label={tc("breadcrumbs")} items={[{ href: `/w/${ws}/projects`, label: tn("projects") }, { label: project.name }]} />
        <PageHeader
          title={
            <span className="inline-flex items-center gap-3">
              <Swatch color={project.color} className="size-3.5" />
              {project.name}
              {project.archivedAt && <Badge variant="secondary">{t("archivedBadge")}</Badge>}
            </span>
          }
          description={project.description}
          actions={
            canEdit && (
              <>
                <NewStudyButton scope={scope} />
                <ProjectActions scope={scope} project={project} />
              </>
            )
          }
        />
        <ProjectTabs base={`/w/${ws}/p/${projectId}`} />
      </div>
      {children}
    </PageContainer>
  );
}
