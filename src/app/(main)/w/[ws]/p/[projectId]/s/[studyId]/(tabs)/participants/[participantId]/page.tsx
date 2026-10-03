import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, CalendarClockIcon, ChevronRightIcon } from "lucide-react";
import { getSessionStudyContext } from "@/server/queries/workspace";
import { getParticipant, participantSessions } from "@/server/services/participants";
import { getGuide } from "@/server/services/guides";
import { isAppError } from "@/server/services/errors";
import { appUrl } from "@/server/url";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalTime } from "@/components/common/local-time";
import { ParticipantStatusBadge, SessionKindLabel, SessionStatusBadge } from "@/components/interviews/participant-bits";
import { ConsentPanel, ParticipantActions } from "@/components/interviews/participant-controls";

async function load(ws: string, projectId: string, studyId: string, participantId: string) {
  const ctx = await getSessionStudyContext(ws, projectId, studyId);
  try {
    return { ...ctx, participant: await getParticipant(ctx.workspace.id, ctx.study.id, participantId) };
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/participants/[participantId]">): Promise<Metadata> {
  const { ws, projectId, studyId, participantId } = await params;
  const { participant } = await load(ws, projectId, studyId, participantId);
  return { title: participant.code };
}

export default async function ParticipantPage({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/participants/[participantId]">) {
  const { ws, projectId, studyId, participantId } = await params;
  const { workspace, role, study, scope, base, participant: p } = await load(ws, projectId, studyId, participantId);
  const t = await getTranslations("participants");
  const [sessions, guide] = await Promise.all([participantSessions(p.id), getGuide(workspace.id, study.id)]);
  const canEdit = can(role, "content:edit");
  const anonymized = !!p.anonymizedAt;
  const consentVersion = guide.consent?.version ?? null;
  const link = `${await appUrl()}/consent/${p.consentToken}`;

  const contact = [
    { label: t("email"), value: p.email },
    { label: t("phone"), value: p.phone },
    { label: t("externalId"), value: p.externalId },
  ].filter((r) => r.value);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid grid-cols-1 min-w-0 flex-1 gap-2">
          <Link href={`${base}/participants`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
            {t("back")}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid grid-cols-1 size-12 place-items-center rounded-2xl bg-accent-soft text-base font-semibold text-accent-soft-foreground">{p.code}</span>
            <div className="grid grid-cols-1 gap-1">
              <h2 className="text-xl font-semibold">{anonymized ? t("anonymized") : (p.name ?? p.code)}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <ParticipantStatusBadge status={p.status} />
                {anonymized && <Badge variant="secondary">{t("anonymizedBadge")}</Badge>}
              </div>
            </div>
          </div>
        </div>
        {canEdit && (
          <ParticipantActions
            scope={scope}
            base={base}
            participantId={p.id}
            code={p.code}
            status={p.status}
            anonymized={anonymized}
            values={{
              name: p.name ?? "",
              email: p.email ?? "",
              phone: p.phone ?? "",
              externalId: p.externalId ?? "",
              notes: p.notes ?? "",
              status: p.status,
              attributes: Object.entries(p.attributes).map(([key, value]) => ({ key, value })),
            }}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="grid grid-cols-1 content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("profile")}</CardTitle>
              {anonymized && <CardDescription>{t("anonymizedHint")}</CardDescription>}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {canEdit &&
                  contact.map((r) => (
                    <div key={r.label} className="grid grid-cols-1 gap-0.5">
                      <dt className="text-muted-foreground">{r.label}</dt>
                      <dd className="break-all">{r.value}</dd>
                    </div>
                  ))}
                {Object.entries(p.attributes).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-1 gap-0.5">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
                {(canEdit ? contact.length : 0) + Object.keys(p.attributes).length === 0 && <p className="text-muted-foreground">{t("noDetails")}</p>}
              </dl>
              {p.notes && canEdit && (
                <div className="mt-5 grid gap-1 border-t pt-4">
                  <p className="text-sm text-muted-foreground">{t("notes")}</p>
                  <p className="text-sm whitespace-pre-line">{p.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("sessionsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {t("noSessions")}
                  {canEdit && (
                    <Link href={`${base}/sessions?new=1&participant=${p.id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                      <CalendarClockIcon className="size-4" aria-hidden />
                      {t("schedule")}
                    </Link>
                  )}
                </div>
              ) : (
                <ul className="grid grid-cols-1 gap-2">
                  {sessions.map((s) => (
                    <li key={s.id}>
                      <Link href={`${base}/sessions/${s.id}`} className="flex items-center gap-3 rounded-xl border p-3 outline-none hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/40">
                        <span className="grid grid-cols-1 min-w-0 flex-1 gap-0.5">
                          <span className="truncate font-medium">{s.title}</span>
                          <span className="text-xs text-muted-foreground">
                            <SessionKindLabel kind={s.kind} />
                            {s.scheduledAt && (
                              <>
                                {" · "}
                                <LocalTime date={s.scheduledAt} preset="weekdayTime" />
                              </>
                            )}
                          </span>
                        </span>
                        <SessionStatusBadge status={s.status} />
                        <ChevronRightIcon className="size-4 text-muted-foreground rtl:rotate-180" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t("consent")}</CardTitle>
            <CardDescription>{t("consentHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConsentPanel
              scope={scope}
              base={base}
              participantId={p.id}
              link={link}
              hasEmail={!!p.email}
              hasForm={!!guide.consent && !anonymized}
              canEdit={canEdit}
              consent={
                p.consentAt
                  ? {
                      at: p.consentAt.toISOString(),
                      method: p.consentMethod ?? "online",
                      name: canEdit ? p.consentName : null,
                      version: p.consentVersion,
                      current: consentVersion === null || p.consentVersion === consentVersion,
                      sentAt: p.consentSentAt?.toISOString() ?? null,
                    }
                  : { at: null, sentAt: p.consentSentAt?.toISOString() ?? null }
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
