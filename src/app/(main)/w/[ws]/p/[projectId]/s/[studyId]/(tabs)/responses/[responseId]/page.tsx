import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, DownloadIcon } from "lucide-react";
import { getStudyContext } from "@/server/queries/workspace";
import { getResponseDetail } from "@/server/services/responses";
import { isAppError } from "@/server/services/errors";
import { answerToText, type FileAnswer } from "@/lib/forms/answers";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RelativeTime } from "@/components/common/relative-time";
import { DeleteResponseButton } from "@/components/studies/delete-response-button";
import { ExcludeResponseButton } from "@/components/studies/exclude-response-button";
import { getAnalysisSettings } from "@/server/services/analysis";
import { QuestionTypeIcon } from "@/components/builder/question-icon";
import { durationParts } from "@/components/studies/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("responses");
  return { title: t("detailTitle") };
}

export default async function ResponseDetailPage({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/responses/[responseId]">) {
  const { ws, projectId, studyId, responseId } = await params;
  const { workspace, role, study } = await getStudyContext(ws, projectId, studyId);
  const t = await getTranslations("responses");
  const tq = await getTranslations("builder");
  const base = `/w/${ws}/p/${projectId}/s/${studyId}`;

  let detail: Awaited<ReturnType<typeof getResponseDetail>>;
  try {
    detail = await getResponseDetail(workspace.id, study.id, responseId);
  } catch (e) {
    if (isAppError(e) && e.code === "notFound") notFound();
    throw e;
  }
  const { response, doc, answers, files } = detail;
  const excludedIds = new Set((await getAnalysisSettings(study.id)).excludedIds);
  const d = durationParts(response.durationMs);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ms-2">
          <Link href={`${base}/responses`}>
            <ArrowLeftIcon className="rtl:rotate-180" />
            {t("title")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {excludedIds.has(response.id) && <Badge variant="destructive">{t("excludedBadge")}</Badge>}
          {can(role, "content:analyze") && (
            <ExcludeResponseButton scope={{ workspaceId: workspace.id, slug: ws, projectId, studyId }} responseId={response.id} excluded={excludedIds.has(response.id)} />
          )}
          {can(role, "content:edit") && <DeleteResponseButton scope={{ workspaceId: workspace.id, slug: ws, projectId, studyId }} responseId={response.id} />}
        </div>
      </div>

      <Card className="gap-3 py-4">
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Badge variant={response.status === "complete" ? "success" : "outline"}>{t(`statuses.${response.status}`)}</Badge>
          <span className="text-muted-foreground">
            {t("started")} <RelativeTime date={response.startedAt} />
          </span>
          {response.submittedAt && (
            <span className="text-muted-foreground">
              {t("submitted")} <RelativeTime date={response.submittedAt} />
            </span>
          )}
          {d && (
            <span className="text-muted-foreground tabular-nums">
              {t("duration")}: {d.m ? t("minutes", { m: d.m, s: String(d.s).padStart(2, "0") }) : t("seconds", { s: d.s })}
            </span>
          )}
          <span className="text-muted-foreground">{t("version", { version: response.formVersion })}</span>
        </CardContent>
      </Card>

      {doc?.pages.map((page, pi) => (
        <section key={page.id} className="grid gap-3" aria-label={page.title || tq("page", { n: pi + 1 })}>
          {doc.pages.length > 1 && <h2 className="text-sm font-medium text-muted-foreground">{page.title || tq("page", { n: pi + 1 })}</h2>}
          <dl className="grid gap-2">
            {page.questions.map((q) => {
              const value = answers[q.id];
              const fileIds = value && typeof value === "object" && "fileIds" in value ? (value as FileAnswer).fileIds : null;
              return (
                <div key={q.id} className="rounded-2xl border bg-card p-4 shadow-soft">
                  <dt className="flex items-start gap-2 text-sm font-medium">
                    <QuestionTypeIcon type={q.type} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {q.title || tq("untitledQuestion")}
                  </dt>
                  <dd className="mt-2 ps-6 text-pretty whitespace-pre-wrap">
                    {value === undefined ? (
                      <span className="text-muted-foreground italic">{t("noAnswer")}</span>
                    ) : fileIds ? (
                      <ul className="grid gap-2">
                        {fileIds.map((id) => {
                          const f = files[id];
                          if (!f) return null;
                          return (
                            <li key={id} className="grid gap-2">
                              {f.mime.startsWith("audio/") && (
                                <audio controls src={`/api/files/${id}`} className="w-full max-w-md" />
                              )}
                              {f.mime.startsWith("video/") && (
                                <video controls src={`/api/files/${id}`} className="w-full max-w-md rounded-xl" />
                              )}
                              {f.mime.startsWith("image/") && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={`/api/files/${id}`} alt={f.name} className="max-h-64 w-auto rounded-xl border" />
                              )}
                              <a href={`/api/files/${id}?download=1`} className="inline-flex w-fit items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline">
                                <DownloadIcon className="size-4" aria-hidden />
                                {f.name}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      answerToText(q, value)
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
