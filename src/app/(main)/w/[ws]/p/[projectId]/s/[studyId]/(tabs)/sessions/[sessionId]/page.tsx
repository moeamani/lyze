import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { getSessionStudyContext } from "@/server/queries/workspace";
import { getSessionDetail } from "@/server/services/sessions";
import { getGuide } from "@/server/services/guides";
import { listParticipants } from "@/server/services/participants";
import { listMembers } from "@/server/services/members";
import { isAppError } from "@/server/services/errors";
import { can } from "@/lib/permissions";
import { isConversation, kindsFor } from "@/lib/interviews/sessions";
import { formatTimestamp } from "@/lib/interviews/time";
import { LocalTime } from "@/components/common/local-time";
import { SessionKindLabel, SessionStatusBadge } from "@/components/interviews/participant-bits";
import { SessionActions, SummaryEditor, TextEntryEditor } from "@/components/interviews/session-controls";
import { SessionWorkspace } from "@/components/interviews/session-workspace";

async function load(ws: string, projectId: string, studyId: string, sessionId: string) {
  const ctx = await getSessionStudyContext(ws, projectId, studyId);
  try {
    return { ...ctx, detail: await getSessionDetail(ctx.workspace.id, ctx.study.id, sessionId) };
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/sessions/[sessionId]">): Promise<Metadata> {
  const { ws, projectId, studyId, sessionId } = await params;
  const { detail } = await load(ws, projectId, studyId, sessionId);
  return { title: detail.session.title };
}

export default async function SessionPage({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/sessions/[sessionId]">) {
  const { ws, projectId, studyId, sessionId } = await params;
  const { user, workspace, role, study, scope, base, detail } = await load(ws, projectId, studyId, sessionId);
  const t = await getTranslations("sessionPage");
  const { session, transcript, segments, notes, media, participants, interviewer } = detail;
  const canEdit = can(role, "content:edit");
  const canAnalyze = can(role, "content:analyze");
  const conversation = isConversation(session.kind);
  const [guide, people, members] = await Promise.all([
    getGuide(workspace.id, study.id),
    canEdit ? listParticipants(workspace.id, study.id) : Promise.resolve([]),
    canEdit ? listMembers(workspace.id) : Promise.resolve([]),
  ]);
  const consentVersion = guide.consent?.version ?? null;

  const details = (
    <div className="grid grid-cols-1 gap-5 rounded-2xl border bg-card p-4 text-sm shadow-soft">
      <dl className="grid grid-cols-1 gap-3">
        <Row label={t("kind")}>
          <SessionKindLabel kind={session.kind} />
        </Row>
        {session.scheduledAt && (
          <Row label={t("when")}>
            <LocalTime date={session.scheduledAt} preset="weekdayTime" />
            {session.durationMin ? ` · ${t("minutes", { minutes: session.durationMin })}` : ""}
          </Row>
        )}
        {session.location && (
          <Row label={t("location")}>
            {/^https?:\/\//.test(session.location) ? (
              <a href={session.location} target="_blank" rel="noreferrer noopener" className="break-all text-primary hover:underline">
                {session.location}
              </a>
            ) : (
              session.location
            )}
          </Row>
        )}
        {interviewer && <Row label={conversation ? t("interviewer") : t("author")}>{interviewer.name || interviewer.email}</Row>}
        {session.mediaDurationMs ? <Row label={t("length")}>{formatTimestamp(session.mediaDurationMs)}</Row> : null}
        <Row label={t("participants")}>
          {participants.length === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <ul className="grid grid-cols-1 gap-1">
              {participants.map((p) => {
                const consented = !!p.consentAt;
                return (
                  <li key={p.id} className="flex items-center gap-2">
                    <Link href={`${base}/participants/${p.id}`} className="font-medium hover:underline">
                      {p.code}
                    </Link>
                    {consentVersion !== null &&
                      (consented ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success">
                          <ShieldCheckIcon className="size-3.5" aria-hidden />
                          {t("consented")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ShieldAlertIcon className="size-3.5" aria-hidden />
                          {t("noConsent")}
                        </span>
                      ))}
                  </li>
                );
              })}
            </ul>
          )}
        </Row>
      </dl>
      <div className="border-t pt-4">
        <SummaryEditor scope={scope} sessionId={session.id} initial={session.summary ?? ""} canEdit={canAnalyze} />
      </div>
    </div>
  );

  const guideView =
    guide.doc.sections.length === 0 ? (
      <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {t("noGuide")}{" "}
        {canEdit && (
          <Link href={`${base}/guide`} className="font-medium text-primary hover:underline">
            {t("writeGuide")}
          </Link>
        )}
      </p>
    ) : (
      <ol className="grid grid-cols-1 gap-4 rounded-2xl border bg-card p-4 text-sm shadow-soft">
        {guide.doc.sections.map((s) => (
          <li key={s.id} className="grid grid-cols-1 gap-1.5">
            <p className="flex items-baseline justify-between gap-2 font-medium">
              {s.title}
              <span className="text-xs font-normal text-muted-foreground">{t("minutes", { minutes: s.minutes })}</span>
            </p>
            <ul className="grid grid-cols-1 list-disc gap-1 ps-5 text-muted-foreground">
              {s.questions.map((q) => (
                <li key={q.id}>{q.text}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    );

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid grid-cols-1 min-w-0 flex-1 gap-2">
          <Link href={`${base}/sessions`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
            {t("back")}
          </Link>
          <h2 className="text-xl font-semibold text-balance">{session.title}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <SessionStatusBadge status={session.status} />
            <SessionKindLabel kind={session.kind} />
            {session.scheduledAt && (
              <>
                <span aria-hidden>·</span>
                <LocalTime date={session.scheduledAt} preset="weekdayTime" />
              </>
            )}
          </div>
        </div>
        {canEdit && (
          <SessionActions
            scope={scope}
            base={base}
            sessionId={session.id}
            kind={session.kind}
            status={session.status}
            scheduled={!!session.scheduledAt}
            kinds={kindsFor(study.type)}
            people={people.map((p) => ({ id: p.id, code: p.code, name: p.anonymizedAt ? null : p.name }))}
            members={members.map((m) => ({ id: m.userId, name: m.name || m.email || "—" }))}
            values={{
              kind: session.kind,
              title: session.title,
              scheduledAt: session.scheduledAt?.toISOString() ?? null,
              durationMin: session.durationMin,
              location: session.location ?? "",
              interviewerId: session.interviewerId,
              participantIds: participants.map((p) => p.id),
            }}
          />
        )}
      </div>

      <SessionWorkspace
        scope={scope}
        sessionId={session.id}
        liveHref={`${base}/sessions/${session.id}/live`}
        conversation={conversation}
        media={media ? { url: `/api/files/${media.id}`, mime: media.mime, name: media.name } : null}
        transcript={transcript ? { status: transcript.status, provider: transcript.provider, error: transcript.error, speakers: transcript.speakers } : null}
        segments={segments}
        notes={notes.map((n) => ({ id: n.id, atMs: n.atMs, tag: n.tag, text: n.text, authorId: n.authorId, authorName: n.authorId === user.id ? t("you") : (n.authorName ?? n.authorEmail) }))}
        participants={participants.map((p) => ({ id: p.id, code: p.code }))}
        canEdit={canEdit}
        canAnalyze={canAnalyze}
        currentUserId={user.id}
        details={details}
        guide={guideView}
        editor={
          conversation ? undefined : (
            <TextEntryEditor scope={scope} sessionId={session.id} kind={session.kind} initial={segments.map((s) => s.text).join("\n\n")} canEdit={canEdit} />
          )
        }
      />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
