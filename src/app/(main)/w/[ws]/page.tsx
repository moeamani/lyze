import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon, FolderKanbanIcon, MessageSquareTextIcon, RadioIcon, type LucideIcon } from "lucide-react";
import { getWorkspaceContext } from "@/server/queries/workspace";
import { workspaceCounts } from "@/server/services/workspaces";
import { recentStudies } from "@/server/services/studies";
import { completedByStudy } from "@/server/services/responses";
import { collectsResponses } from "@/lib/studies";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { StudyCard } from "@/components/studies/study-card";
import { ClipboardIllustration } from "@/components/illustrations";
import { Greeting } from "@/components/workspace/greeting";

export async function generateMetadata({ params }: PageProps<"/w/[ws]">): Promise<Metadata> {
  const { ws } = await params;
  const { workspace } = await getWorkspaceContext(ws);
  return { title: workspace.name };
}

function Stat({ icon: Icon, label, value, href }: { icon: LucideIcon; label: string; value: number; href?: string }) {
  const body = (
    <>
      <span className="hidden size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-soft-foreground sm:grid">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-semibold tabular-nums">{value}</span>
        <span className="block text-xs text-muted-foreground sm:text-sm">{label}</span>
      </span>
    </>
  );
  const className = "flex items-center gap-4 rounded-2xl border bg-card p-3.5 shadow-soft sm:p-4";
  return href ? (
    <Link href={href} className={`${className} transition-shadow outline-none hover:shadow-lift focus-visible:ring-[3px] focus-visible:ring-ring/40`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export default async function DashboardPage({ params }: PageProps<"/w/[ws]">) {
  const { ws } = await params;
  const { user, workspace, role } = await getWorkspaceContext(ws);
  const t = await getTranslations("dashboard");
  const [counts, studies, completed] = await Promise.all([workspaceCounts(workspace.id), recentStudies(workspace.id), completedByStudy(workspace.id)]);
  const scope = { workspaceId: workspace.id, slug: workspace.slug };
  const firstName = user.name?.split(" ")[0] ?? user.email.split("@")[0];
  const canEdit = can(role, "content:edit");

  return (
    <PageContainer>
      <PageHeader
        eyebrow={workspace.name}
        title={<Greeting name={firstName ?? ""} />}
        description={t("subtitle")}
        actions={canEdit && <NewProjectButton scope={scope} />}
      />

      <section aria-label={t("overview")} className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stat icon={FolderKanbanIcon} label={t("stats.projects")} value={counts.projects} href={`/w/${ws}/projects`} />
        <Stat icon={RadioIcon} label={t("stats.liveStudies", { total: counts.studies })} value={counts.liveStudies} />
        <Stat icon={MessageSquareTextIcon} label={t("stats.responses")} value={counts.responses} />
      </section>

      <section aria-labelledby="recent-studies" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="recent-studies" className="text-lg font-semibold">
            {t("recentStudies")}
          </h2>
          {studies.length > 0 && (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/w/${ws}/projects`}>
                {t("allProjects")}
                <ArrowRightIcon className="rtl:rotate-180" />
              </Link>
            </Button>
          )}
        </div>
        {studies.length === 0 ? (
          <EmptyState
            illustration={<ClipboardIllustration />}
            title={t("emptyTitle")}
            description={canEdit ? t("emptyBody") : t("emptyBodyReadOnly")}
          >
            {canEdit && <NewProjectButton scope={scope} variant="soft" />}
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
            {studies.map((s) => (
              <li key={s.id}>
                <StudyCard
                  href={`/w/${ws}/p/${s.projectId}/s/${s.id}`}
                  study={s}
                  project={{ name: s.projectName, color: s.projectColor }}
                  responses={collectsResponses(s.type) ? (completed.get(s.id) ?? 0) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}
