import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArchiveIcon } from "lucide-react";
import { getWorkspaceContext } from "@/server/queries/workspace";
import { listProjects } from "@/server/services/projects";
import { can } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { swatchClass } from "@/components/common/swatch";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { FoldersIllustration } from "@/components/illustrations";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("projects");
  return { title: t("title") };
}

export default async function ProjectsPage({ params, searchParams }: PageProps<"/w/[ws]/projects">) {
  const { ws } = await params;
  const archived = (await searchParams).view === "archived";
  const { workspace, role } = await getWorkspaceContext(ws);
  const t = await getTranslations("projects");
  const projects = await listProjects(workspace.id, { archived });
  const scope = { workspaceId: workspace.id, slug: workspace.slug };
  const canEdit = can(role, "content:edit");

  return (
    <PageContainer>
      <PageHeader title={t("title")} description={t("subtitle")} actions={canEdit && <NewProjectButton scope={scope} />} />

      <SegmentedNav
        label={t("views")}
        items={[
          { href: `/w/${ws}/projects`, label: t("active"), active: !archived },
          {
            href: `/w/${ws}/projects?view=archived`,
            label: (
              <>
                <ArchiveIcon />
                {t("archivedTab")}
              </>
            ),
            active: archived,
          },
        ]}
      />

      {projects.length === 0 ? (
        archived ? (
          <EmptyState illustration={<FoldersIllustration />} title={t("noArchivedTitle")} description={t("noArchivedBody")} />
        ) : (
          <EmptyState
            illustration={<FoldersIllustration />}
            title={t("emptyTitle")}
            description={canEdit ? t("emptyBody") : t("emptyBodyReadOnly")}
          >
            {canEdit && <NewProjectButton scope={scope} variant="soft" />}
          </EmptyState>
        )
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/w/${ws}/p/${p.id}`}
                className="group flex h-full flex-col gap-3 overflow-hidden rounded-2xl border bg-card p-5 shadow-soft transition-[box-shadow,transform] outline-none hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-[3px] focus-visible:ring-ring/40 motion-reduce:hover:translate-y-0"
              >
                <span aria-hidden className={cn("h-1.5 w-10 rounded-full", swatchClass(p.color))} />
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold">{p.name}</span>
                  {p.description && <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description}</span>}
                </span>
                <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                  <Badge variant="secondary">{t("studyCount", { count: p.studyCount })}</Badge>
                  <RelativeTime date={p.updatedAt} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
