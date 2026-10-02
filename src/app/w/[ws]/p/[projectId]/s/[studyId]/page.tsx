import type { Metadata } from "next";
import type { Messages } from "next-intl";
import { getTranslations } from "next-intl/server";
import { CircleCheckIcon, CircleIcon } from "lucide-react";
import { getStudyContext } from "@/server/queries/workspace";
import { can } from "@/lib/permissions";
import { collectsResponses, collectsSessions } from "@/lib/studies";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { Breadcrumbs } from "@/components/common/breadcrumbs";
import { StudyTypeIcon } from "@/components/common/study-type-icon";
import { StudyStatusBadge } from "@/components/studies/study-card";
import { StudySettings } from "@/components/studies/study-settings";

export async function generateMetadata({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]">): Promise<Metadata> {
  const { ws, projectId, studyId } = await params;
  const { study } = await getStudyContext(ws, projectId, studyId);
  return { title: study.name };
}

export default async function StudyPage({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]">) {
  const { ws, projectId, studyId } = await params;
  const { workspace, role, project, study } = await getStudyContext(ws, projectId, studyId);
  const t = await getTranslations("studies");
  const tt = await getTranslations("studyTypes");
  const tn = await getTranslations("nav");
  const tc = await getTranslations("common");
  const scope = { workspaceId: workspace.id, slug: workspace.slug, projectId: project.id };

  // A short, type-aware checklist of what this study involves. Steps light up as features land.
  type Step = { key: keyof Messages["studies"]["steps"]; done: boolean };
  const steps: Step[] = [{ key: "create", done: true }];
  if (collectsResponses(study.type)) {
    steps.push({ key: "buildForm", done: false }, { key: "share", done: study.status !== "draft" });
  }
  if (collectsSessions(study.type)) {
    steps.push({ key: "participants", done: false }, { key: "sessions", done: false });
  }
  steps.push({ key: "analyze", done: false });

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
            <span className="inline-flex items-center gap-2">
              <Badge variant="soft">
                <StudyTypeIcon type={study.type} />
                {tt(`${study.type}.name`)}
              </Badge>
              <StudyStatusBadge status={study.status} />
              {study.isDemo && <Badge variant="outline">{t("demo")}</Badge>}
            </span>
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t("detailsTitle")}</CardTitle>
            <CardDescription>{t("detailsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <StudySettings
              scope={scope}
              study={{ id: study.id, name: study.name, description: study.description, status: study.status }}
              canEdit={can(role, "content:edit")}
            />
          </CardContent>
        </Card>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("stepsTitle")}</CardTitle>
            <CardDescription>{tt(`${study.type}.hint`)}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3">
              {steps.map((step) => (
                <li key={step.key} className="flex items-start gap-3 text-sm">
                  {step.done ? (
                    <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <CircleIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className={step.done ? "text-muted-foreground line-through decoration-muted-foreground/40" : ""}>
                    {t(`steps.${step.key}`)}
                    <span className="sr-only">{step.done ? ` (${t("stepDone")})` : ""}</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
