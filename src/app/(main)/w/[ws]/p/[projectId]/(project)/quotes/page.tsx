import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { listCodes } from "@/server/services/codebook";
import { listQuotes } from "@/server/services/coding";
import { listThemes } from "@/server/services/themes";
import { listStudies } from "@/server/services/studies";
import { projectParticipants } from "@/server/services/qual-search";
import { formatTimestamp } from "@/lib/interviews/time";
import { can } from "@/lib/permissions";
import { QuoteFilters, QuoteList } from "@/components/qual/quote-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quotes");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function QuotesPage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/quotes">) {
  const { ws, projectId } = await params;
  const sp = await searchParams;
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("quotes");
  const filter = { codeId: str(sp.code), themeId: str(sp.theme), studyId: str(sp.study), participantId: str(sp.participant), starred: sp.starred === "1" || undefined, q: str(sp.q) };
  const [quotes, codes, themes, studies, people] = await Promise.all([
    listQuotes(workspace.id, project.id, filter),
    listCodes(workspace.id, project.id),
    listThemes(workspace.id, project.id),
    listStudies(workspace.id, project.id),
    projectParticipants(project.id),
  ]);
  const base = `/w/${ws}/p/${projectId}`;
  const exportParams = new URLSearchParams({ format: "quotes", ...(filter.starred ? { starred: "1" } : {}), ...(filter.codeId ? { code: filter.codeId } : {}) });
  return (
    <div className="grid gap-4">
      <QuoteFilters
        codes={codes.map((c) => ({ id: c.id, label: c.path.join(" › "), color: c.color }))}
        themes={themes.map((th) => ({ id: th.id, label: th.name }))}
        studies={studies.map((s) => ({ id: s.id, label: s.name }))}
        people={people.map((p) => ({ id: p.id, label: p.code }))}
      />
      <QuoteList
        scope={{ workspaceId: workspace.id, slug: workspace.slug, projectId: project.id }}
        canStar={can(role, "content:analyze")}
        exportHref={`/api/projects/${project.id}/export?${exportParams}`}
        codes={Object.fromEntries(codes.map((c) => [c.id, { name: c.name, color: c.color }]))}
        quotes={quotes.map((q) => ({
          id: q.id,
          quote: q.quote,
          codeIds: q.codeIds,
          starred: q.starred,
          href: `${base}/coding?doc=${encodeURIComponent(q.source.kind === "session" ? `s:${q.source.sessionId}` : `q:${q.source.studyId}:${q.source.questionId}`)}#u-${q.unitId}`,
          meta: [
            q.participantCode ?? q.speaker,
            q.source.kind === "session" ? q.source.title : t("surveyAnswer"),
            q.source.kind === "session" && q.source.startMs !== null ? formatTimestamp(q.source.startMs) : null,
            studies.length > 1 ? q.studyName : null,
          ]
            .filter(Boolean)
            .join(" · "),
        }))}
      />
    </div>
  );
}
