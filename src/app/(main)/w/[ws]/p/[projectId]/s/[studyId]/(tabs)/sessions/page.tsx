import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon, FileTextIcon, Loader2Icon, MapPinIcon, MicIcon, StickyNoteIcon, VideoIcon } from "lucide-react";
import { getSessionStudyContext } from "@/server/queries/workspace";
import { listSessions, type SessionListItem } from "@/server/services/sessions";
import { listParticipants } from "@/server/services/participants";
import { listMembers } from "@/server/services/members";
import { can } from "@/lib/permissions";
import { kindsFor } from "@/lib/interviews/sessions";
import { EmptyState } from "@/components/common/empty-state";
import { LocalTime } from "@/components/common/local-time";
import { TimelineIllustration } from "@/components/illustrations";
import { SessionKindLabel, SessionStatusBadge } from "@/components/interviews/participant-bits";
import { NewSessionButton } from "@/components/interviews/session-dialog";
import { SessionKindIcon } from "@/components/interviews/kind-icon";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sessions");
  return { title: t("title") };
}

export default async function SessionsPage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/sessions">) {
  const { ws, projectId, studyId } = await params;
  const sp = await searchParams;
  const { user, workspace, role, study, scope, base } = await getSessionStudyContext(ws, projectId, studyId);
  const t = await getTranslations("sessions");
  const canEdit = can(role, "content:edit");
  const [sessions, people, members] = await Promise.all([listSessions(workspace.id, study.id), listParticipants(workspace.id, study.id), canEdit ? listMembers(workspace.id) : Promise.resolve([])]);

  const { upcoming, done, other } = groupSessions(sessions);

  const newButton = canEdit && (
    <NewSessionButton
      scope={scope}
      base={base}
      kinds={kindsFor(study.type)}
      people={people.filter((p) => p.status !== "withdrawn" && p.status !== "ineligible").map((p) => ({ id: p.id, code: p.code, name: p.anonymizedAt ? null : p.name }))}
      members={members.map((m) => ({ id: m.userId, name: m.name || m.email || "—" }))}
      currentUserId={user.id}
      defaultOpen={sp.new === "1"}
      defaultParticipant={typeof sp.participant === "string" ? sp.participant : null}
    />
  );

  if (sessions.length === 0) {
    return (
      <EmptyState illustration={<TimelineIllustration />} title={t("emptyTitle")} description={t("emptyBody")}>
        {newButton}
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        {newButton}
      </div>
      <Group title={t("upNext")} items={upcoming} base={base} empty={t("nothingUpcoming")} />
      {other.length > 0 && <Group title={t("needsUpdate")} items={other} base={base} />}
      <Group title={t("done")} items={done} base={base} empty={t("nothingDone")} />
    </div>
  );
}

/** Up next (in progress first, then soonest), done, and past sessions nobody closed. */
function groupSessions(sessions: SessionListItem[]) {
  const cutoff = Date.now() - 3 * 3_600_000;
  const upcoming = sessions
    .filter((s) => s.status === "in_progress" || (s.status === "scheduled" && (!s.scheduledAt || s.scheduledAt.getTime() > cutoff)))
    .sort((a, b) => (a.status === "in_progress" ? -1 : 0) - (b.status === "in_progress" ? -1 : 0) || (a.scheduledAt?.getTime() ?? Infinity) - (b.scheduledAt?.getTime() ?? Infinity));
  const done = sessions.filter((s) => s.status === "completed");
  const other = sessions.filter((s) => !upcoming.includes(s) && !done.includes(s));
  return { upcoming, done, other };
}

async function Group({ title, items, base, empty }: { title: string; items: SessionListItem[]; base: string; empty?: string }) {
  const t = await getTranslations("sessions");
  if (!items.length && !empty) return null;
  return (
    <section className="grid grid-cols-1 gap-2" aria-label={title}>
      <h2 className="text-sm font-medium text-muted-foreground">
        {title} <span className="tabular-nums">· {items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {items.map((s) => {
            return (
              <li key={s.id}>
                <Link
                  href={`${base}/sessions/${s.id}`}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-soft transition-colors outline-none hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:p-4"
                >
                  <span className="grid grid-cols-1 size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-soft-foreground">
                    <SessionKindIcon kind={s.kind} className="size-5" />
                  </span>
                  <span className="grid grid-cols-1 min-w-0 flex-1 gap-1">
                    <span className="truncate font-medium">{s.title}</span>
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <SessionKindLabel kind={s.kind} />
                        {s.scheduledAt && (
                          <>
                            {" · "}
                            <LocalTime date={s.scheduledAt} preset="weekdayTime" />
                          </>
                        )}
                      </span>
                      {s.location && (
                        <span className="flex max-w-48 min-w-0 items-center gap-1">
                          <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{s.location}</span>
                        </span>
                      )}
                      {s.mediaKind && (
                        <span className="inline-flex items-center gap-1">
                          {s.mediaKind === "video" ? <VideoIcon className="size-3.5" aria-hidden /> : <MicIcon className="size-3.5" aria-hidden />}
                          {t("recording")}
                        </span>
                      )}
                      {s.transcriptStatus === "processing" && (
                        <span className="inline-flex items-center gap-1">
                          <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
                          {t("transcribing")}
                        </span>
                      )}
                      {s.transcriptStatus === "ready" && (
                        <span className="inline-flex items-center gap-1">
                          <FileTextIcon className="size-3.5" aria-hidden />
                          {t("transcript")}
                        </span>
                      )}
                      {s.noteCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <StickyNoteIcon className="size-3.5" aria-hidden />
                          {t("noteCount", { count: s.noteCount })}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="hidden text-sm font-medium tabular-nums sm:block">{s.participants.map((p) => p.code).join(", ")}</span>
                  <SessionStatusBadge status={s.status} />
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
