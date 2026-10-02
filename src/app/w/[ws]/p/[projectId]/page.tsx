import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { listStudies } from "@/server/services/studies";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { Swatch } from "@/components/common/swatch";
import { ProjectActions } from "@/components/projects/project-actions";
import { NewStudyButton } from "@/components/studies/study-dialog";
import { StudyCard } from "@/components/studies/study-card";
import { ClipboardIllustration } from "@/components/illustrations";

export async function generateMetadata({ params }: PageProps<"/w/[ws]/p/[projectId]">): Promise<Metadata> {
  const { ws, projectId } = await params;
  const { project } = await getProjectContext(ws, projectId);
  return { title: project.name };
}

export default async function ProjectPage({ params }: PageProps<"/w/[ws]/p/[projectId]">) {
  const { ws, projectId } = await params;
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("projects");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const studies = await listStudies(workspace.id, project.id);
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
      </div>

      <section aria-labelledby="studies-heading" className="flex flex-col gap-3">
        <h2 id="studies-heading" className="text-lg font-semibold">
          {t("studiesHeading")} <span className="font-normal text-muted-foreground tabular-nums">({studies.length})</span>
        </h2>
        {studies.length === 0 ? (
          <EmptyState
            illustration={<ClipboardIllustration />}
            title={t("noStudiesTitle")}
            description={canEdit ? t("noStudiesBody") : t("noStudiesReadOnly")}
          >
            {canEdit && <NewStudyButton scope={scope} variant="outline" />}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5">
            {studies.map((s) => (
              <li key={s.id}>
                <StudyCard href={`/w/${ws}/p/${project.id}/s/${s.id}`} study={s} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
