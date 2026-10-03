import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { listStudies } from "@/server/services/studies";
import { completedByStudy } from "@/server/services/responses";
import { collectsResponses } from "@/lib/studies";
import { can } from "@/lib/permissions";
import { EmptyState } from "@/components/common/empty-state";
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
  const [studies, completed] = await Promise.all([listStudies(workspace.id, project.id), completedByStudy(workspace.id)]);
  const canEdit = can(role, "content:edit");
  const scope = { workspaceId: workspace.id, slug: workspace.slug, projectId: project.id };

  return (
    <section aria-labelledby="studies-heading" className="flex flex-col gap-3">
      <h2 id="studies-heading" className="text-lg font-semibold">
        {t("studiesHeading")} <span className="font-normal text-muted-foreground tabular-nums">({studies.length})</span>
      </h2>
      {studies.length === 0 ? (
        <EmptyState illustration={<ClipboardIllustration />} title={t("noStudiesTitle")} description={canEdit ? t("noStudiesBody") : t("noStudiesReadOnly")}>
          {canEdit && <NewStudyButton scope={scope} variant="outline" />}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5">
          {studies.map((s) => (
            <li key={s.id}>
              <StudyCard href={`/w/${ws}/p/${project.id}/s/${s.id}`} study={s} responses={collectsResponses(s.type) ? (completed.get(s.id) ?? 0) : undefined} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
