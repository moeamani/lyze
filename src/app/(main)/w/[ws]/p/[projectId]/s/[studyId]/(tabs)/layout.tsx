import { getTranslations } from "next-intl/server";
import { getStudyContext } from "@/server/queries/workspace";
import { collectsResponses } from "@/lib/studies";
import { Badge } from "@/components/ui/badge";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { StudyTypeIcon } from "@/components/common/study-type-icon";
import { StudyStatusBadge } from "@/components/studies/study-card";
import { StudyTabs } from "@/components/studies/study-tabs";

export default async function StudyLayout({ children, params }: LayoutProps<"/w/[ws]/p/[projectId]/s/[studyId]">) {
  const { ws, projectId, studyId } = await params;
  const { project, study } = await getStudyContext(ws, projectId, studyId);
  const t = await getTranslations("studies");
  const tt = await getTranslations("studyTypes");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const base = `/w/${ws}/p/${projectId}/s/${studyId}`;

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <Breadcrumbs
          label={tc("breadcrumbs")}
          items={[
            { href: `/w/${ws}/projects`, label: tn("projects") },
            { href: `/w/${ws}/p/${project.id}`, label: project.name },
            { label: study.name },
          ]}
        />
        <PageHeader
          title={study.name}
          description={study.description}
          eyebrow={
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge variant="soft">
                <StudyTypeIcon type={study.type} />
                {tt(`${study.type}.name`)}
              </Badge>
              <StudyStatusBadge status={study.status} />
              {study.isDemo && <Badge variant="outline">{t("demo")}</Badge>}
            </span>
          }
        />
        {collectsResponses(study.type) && <StudyTabs base={base} />}
      </div>
      {children}
    </PageContainer>
  );
}
