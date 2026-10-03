import type { Metadata } from "next";
import type { Messages } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getWorkspaceContext } from "@/server/queries/workspace";
import { listAuditEvents } from "@/server/services/audit";
import { can } from "@/lib/permissions";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { NoAccess } from "@/components/common/no-access";
import { RelativeTime } from "@/components/common/relative-time";
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
]);

export default async function ActivityPage({ params }: PageProps<"/w/[ws]/activity">) {
  const { ws } = await params;
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

  const events = await listAuditEvents(workspace.id, { limit: 100 });

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {events.length === 0 ? (
        <EmptyState illustration={<TimelineIllustration />} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ol className="relative flex flex-col gap-1 before:absolute before:inset-y-3 before:start-[1.1rem] before:w-px before:bg-border">
          {events.map((e) => {
            const actor = e.actorName || e.actorEmail || t("someone");
            const meta = e.metadata as Record<string, string | undefined>;
            const key = (KNOWN_ACTIONS.has(e.action) ? e.action.replace(".", "_") : "unknown") as EventKey;
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
              <li key={e.id} className="relative flex items-start gap-3 rounded-xl p-2">
                <Avatar className="size-9 ring-4 ring-background">
                  <AvatarFallback>{initials(actor)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-sm text-pretty break-words">{t(`events.${key}`, values)}</p>
                  <p className="text-xs text-muted-foreground">
                    <RelativeTime date={e.createdAt} />
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </PageContainer>
  );
}
