import type { Metadata } from "next";
import type { Messages } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getWorkspaceContext } from "@/server/queries/workspace";
import Link from "next/link";
import { ACTIVITY_CATEGORIES, activityCounts, categoryOf, listAuditEvents, type ActivityCategory } from "@/server/services/audit";
import { listMembers } from "@/server/services/members";
import { BuildingIcon, ClipboardListIcon, FolderIcon, HighlighterIcon, LayoutListIcon, MessagesSquareIcon, PenLineIcon, SendIcon, UserRoundIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { SectionIcon, type Section } from "@/components/common/section-icon";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { NoAccess } from "@/components/common/no-access";
import { RelativeTime } from "@/components/common/relative-time";
import { LocalTime } from "@/components/common/local-time";
import { TimelineIllustration } from "@/components/illustrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("activity");
  return { title: t("title") };
}

type EventKey = keyof Messages["activity"]["events"];

const KNOWN_ACTIONS = new Set([
  "workspace.created",
  "workspace.updated",
  "project.created",
  "project.updated",
  "project.archived",
  "project.restored",
  "project.deleted",
  "study.created",
  "study.updated",
  "study.status_changed",
  "study.deleted",
  "member.invited",
  "member.invite_revoked",
  "member.joined",
  "member.role_changed",
  "member.removed",
  "member.left",
  "form.created",
  "form.published",
  "form.invited",
  "response.deleted",
  "analysis.updated",
  "data.exported",
  "consent.updated",
  "participant.created",
  "participant.imported",
  "participant.updated",
  "participant.status",
  "participant.consent_sent",
  "participant.consent_signed",
  "participant.consent_recorded",
  "participant.consent_revoked",
  "participant.anonymized",
  "participant.deleted",
  "session.created",
  "session.updated",
  "session.status",
  "session.deleted",
  "session.media_uploaded",
  "session.transcript_imported",
  "brief.updated",
  "writeup.created",
  "report.created",
  "report.shared",
  "report.unshared",
  "response.generated",
  "response.imported",
  "workspace.ai_updated",
  "workspace.api_key_created",
  "workspace.api_key_revoked",
  "workspace.webhook_created",
]);

const LOOK: Record<ActivityCategory, { icon: LucideIcon; section: Section }> = {
  workspace: { icon: BuildingIcon, section: "activity" },
  project: { icon: FolderIcon, section: "forms" },
  study: { icon: LayoutListIcon, section: "forms" },
  member: { icon: UsersIcon, section: "activity" },
  form: { icon: SendIcon, section: "forms" },
  response: { icon: ClipboardListIcon, section: "forms" },
  participant: { icon: UserRoundIcon, section: "people" },
  session: { icon: MessagesSquareIcon, section: "interviews" },
  coding: { icon: HighlighterIcon, section: "coding" },
  writeup: { icon: PenLineIcon, section: "writeup" },
};

const PAGE = 50;
const day = (d: Date) => d.toISOString().slice(0, 10);
function recentDays() {
  const now = Date.now();
  return { today: day(new Date(now)), yesterday: day(new Date(now - 864e5)) };
}

export default async function ActivityPage({ params, searchParams }: PageProps<"/w/[ws]/activity">) {
  const { ws } = await params;
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const { workspace, role } = await getWorkspaceContext(ws);
  const t = await getTranslations("activity");
  const tr = await getTranslations("roles");
  const ts = await getTranslations("studyStatus");

  if (!can(role, "audit:view")) {
    return (
      <PageContainer>
        <NoAccess />
      </PageContainer>
    );
  }

  const categories = (str("cat") ?? "").split(",").filter((c): c is ActivityCategory => (ACTIVITY_CATEGORIES as readonly string[]).includes(c));
  const date = (v: string | undefined, plusDay = false) => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
    const d = new Date(`${v}T00:00:00Z`);
    if (plusDay) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  };
  const before = str("before") ? new Date(str("before")!) : undefined;
  const [events, counts, members] = await Promise.all([
    listAuditEvents(workspace.id, { limit: PAGE + 1, before: before && !Number.isNaN(+before) ? before : undefined, categories, actorId: str("actor"), from: date(str("from")), to: date(str("to"), true), q: str("q") }),
    activityCounts(workspace.id),
    listMembers(workspace.id),
  ]);
  const more = events.length > PAGE;
  const shown = events.slice(0, PAGE);
  const filtered = categories.length > 0 || !!(str("actor") || str("from") || str("to") || str("q"));
  const { today, yesterday } = recentDays();
  const byDay = new Map<string, typeof shown>();
  for (const e of shown) byDay.set(day(e.createdAt), [...(byDay.get(day(e.createdAt)) ?? []), e]);
  const nextParams = new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" && k !== "before" ? [[k, v]] : [])));
  if (more) nextParams.set("before", shown.at(-1)!.createdAt.toISOString());

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ActivityFilters categories={ACTIVITY_CATEGORIES.map((id) => ({ id, count: counts[id] }))} members={members.map((m) => ({ id: m.userId, label: m.name || m.email || "" }))} />
      {shown.length === 0 ? (
        filtered ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("noMatches")}</p>
        ) : (
          <EmptyState illustration={<TimelineIllustration />} title={t("emptyTitle")} description={t("emptyBody")} />
        )
      ) : (
        <div className="grid gap-6">
          {[...byDay].map(([d, list]) => (
            <section key={d} aria-label={d} className="grid gap-1">
              <h2 className="sticky top-(--header-height) z-10 bg-background/90 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase backdrop-blur md:top-0">
                {d === today ? t("today") : d === yesterday ? t("yesterday") : <LocalTime date={`${d}T12:00:00Z`} preset="date" />}
              </h2>
              <ol className="grid gap-0.5">
                {list.map((e) => {
                  const actor = e.actorName || e.actorEmail || t("someone");
                  const meta = e.metadata as Record<string, string | undefined>;
                  const key = (KNOWN_ACTIONS.has(e.action) ? e.action.replace(".", "_") : "unknown") as EventKey;
                  const cat = categoryOf(e.action, e.entityType);
                  const look = LOOK[cat];
                  const values = {
                    actor,
                    name: meta.name ?? meta.title ?? "",
                    code: meta.code ?? "",
                    count: String(meta.count ?? ""),
                    version: String(meta.version ?? ""),
                    email: meta.email ?? "",
                    role: meta.role ? tr(meta.role as "viewer") : meta.to && e.action === "member.role_changed" ? tr(meta.to as "viewer") : "",
                    status: meta.to && e.action === "study.status_changed" ? ts(meta.to as "draft") : "",
                    action: e.action,
                  };
                  return (
                    <li key={e.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-accent/50">
                      <SectionIcon section={look.section} icon={look.icon} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-pretty break-words">{t(`events.${key}`, values)}</p>
                        <p className="text-xs text-muted-foreground">
                          {t(`categories.${cat}`)} · <RelativeTime date={e.createdAt} />
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {more && (
            <Button variant="outline" className="justify-self-center" asChild>
              <Link href={`/w/${ws}/activity?${nextParams}`}>{t("older")}</Link>
            </Button>
          )}
        </div>
      )}
    </PageContainer>
  );
}
