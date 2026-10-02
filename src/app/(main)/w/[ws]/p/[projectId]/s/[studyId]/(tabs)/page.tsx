import type { Metadata } from "next";
import Link from "next/link";
import type { Messages } from "next-intl";
import { getTranslations } from "next-intl/server";
import { CircleCheckIcon, CircleIcon, PencilRulerIcon, Share2Icon } from "lucide-react";
import { getStudyContext } from "@/server/queries/workspace";
import { getFormForStudy, hasUnpublishedChanges } from "@/server/services/forms";
import { responseCounts } from "@/server/services/responses";
import { can } from "@/lib/permissions";
import { collectsResponses, collectsSessions } from "@/lib/studies";
import { allQuestions } from "@/lib/forms/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  const tr = await getTranslations("responses");
  const scope = { workspaceId: workspace.id, slug: workspace.slug, projectId: project.id };
  const base = `/w/${ws}/p/${projectId}/s/${studyId}`;
  const usesForm = collectsResponses(study.type);
  const [form, counts] = usesForm ? await Promise.all([getFormForStudy(workspace.id, study.id), responseCounts(workspace.id, study.id)]) : [null, null];
  const changes = form ? await hasUnpublishedChanges(form) : false;
  const questionCount = form ? allQuestions(form.draft).length : 0;

  type Step = { key: keyof Messages["studies"]["steps"]; done: boolean };
  const steps: Step[] = [{ key: "create", done: true }];
  if (usesForm) {
    steps.push({ key: "buildForm", done: questionCount > 0 }, { key: "share", done: !!form?.publishedVersion && (counts?.complete ?? 0) > 0 });
  }
  if (collectsSessions(study.type)) {
    steps.push({ key: "participants", done: false }, { key: "sessions", done: false });
  }
  steps.push({ key: "analyze", done: false });

  const formStatus = !form ? t("formStatus.none") : !form.publishedVersion ? t("formStatus.draft") : changes ? t("formStatus.changes", { version: form.publishedVersion }) : t("formStatus.live", { version: form.publishedVersion });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="grid content-start gap-6">
        {usesForm && (
          <Card>
            <CardHeader>
              <CardTitle>{t("formCard")}</CardTitle>
              <CardDescription>{formStatus}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {counts && (
                <dl className="grid grid-cols-3 gap-2">
                  {(["complete", "partial", "screened_out"] as const).map((s) => (
                    <div key={s} className="rounded-xl bg-muted/60 p-3">
                      <dt className="text-xs text-muted-foreground">{tr(`statuses.${s}`)}</dt>
                      <dd className="text-2xl font-semibold tabular-nums">{counts[s]}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <Link href={`${base}/build`}>
                    <PencilRulerIcon />
                    {t("openBuilder")}
                  </Link>
                </Button>
                {form?.publishedVersion && (
                  <Button asChild variant="outline">
                    <Link href={`${base}/share`}>
                      <Share2Icon />
                      {tr("share")}
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
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
      </div>
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
  );
}
