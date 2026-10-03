import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getProjectContext } from "@/server/queries/workspace";
import { projectParticipants, searchProject } from "@/server/services/qual-search";
import { listCodes } from "@/server/services/codebook";
import { listStudies } from "@/server/services/studies";
import { formatTimestamp } from "@/lib/interviews/time";
import { codeColorVar } from "@/lib/qual/codes";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/common/local-time";
import { SearchForm } from "@/components/qual/search-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("search");
  return { title: t("title") };
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function SearchPage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/search">) {
  const { ws, projectId } = await params;
  const sp = await searchParams;
  const { workspace, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("search");
  const [studies, people, codes] = await Promise.all([listStudies(workspace.id, project.id), projectParticipants(project.id), listCodes(workspace.id, project.id)]);
  const kinds = str(sp.in)?.split(",").filter((k): k is "segment" | "answer" | "memo" => ["segment", "answer", "memo"].includes(k));
  const asked = !!(str(sp.q) || str(sp.code) || str(sp.participant));
  const result = asked
    ? await searchProject(workspace.id, project.id, {
        q: str(sp.q) ?? "",
        kinds: kinds?.length ? kinds : undefined,
        studyId: str(sp.study),
        participantId: str(sp.participant),
        codeId: str(sp.code),
        from: str(sp.from) ? new Date(`${str(sp.from)}T00:00:00Z`) : undefined,
        to: str(sp.to) ? new Date(`${str(sp.to)}T23:59:59Z`) : undefined,
      })
    : null;
  const codeById = new Map(codes.map((c) => [c.id, c]));
  const base = `/w/${ws}/p/${projectId}`;

  return (
    <div className="grid gap-5">
      <SearchForm studies={studies.map((s) => ({ id: s.id, label: s.name }))} people={people.map((p) => ({ id: p.id, label: p.code }))} codes={codes.map((c) => ({ id: c.id, label: c.path.join(" › ") }))} />
      {!result ? (
        <p className="text-sm text-muted-foreground">{t("hint")}</p>
      ) : (
        <section aria-labelledby="results-title" className="grid gap-3">
          <h2 id="results-title" className="text-sm font-medium text-muted-foreground" aria-live="polite">
            {result.truncated ? t("resultsTruncated", { count: result.hits.length }) : t("results", { count: result.hits.length })}
          </h2>
          {result.hits.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="grid gap-2">
              {result.hits.map((h) => {
                const href = h.kind === "memo" ? `${base}/memos` : `${base}/coding?doc=${encodeURIComponent(h.docKey!)}#u-${h.id}`;
                const s = h.snippet;
                const parts: React.ReactNode[] = [];
                let at = 0;
                s.hits.forEach((r, i) => {
                  parts.push(s.text.slice(at, r.start), <mark key={i} className="rounded-sm bg-warning/40 text-foreground">{s.text.slice(r.start, r.end)}</mark>);
                  at = r.end;
                });
                parts.push(s.text.slice(at));
                return (
                  <li key={`${h.kind}-${h.id}`}>
                    <Link href={href} className="grid gap-1.5 rounded-2xl border bg-card p-4 shadow-soft outline-none hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/40">
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline">{t(`kinds.${h.kind}`)}</Badge>
                        <span className="font-medium text-foreground">{h.title || t("untitledMemo")}</span>
                        {h.who && <span>· {h.who}</span>}
                        {h.startMs !== null && <span className="tabular-nums">· {formatTimestamp(h.startMs)}</span>}
                        {h.studyName && studies.length > 1 && <span>· {h.studyName}</span>}
                        {h.date && (
                          <span className="ms-auto">
                            <LocalTime date={h.date} preset="date" />
                          </span>
                        )}
                      </span>
                      <span className="text-sm leading-relaxed">
                        {s.clippedStart && "… "}
                        {parts}
                        {s.clippedEnd && " …"}
                      </span>
                      {h.codeIds.length > 0 && (
                        <span className="flex flex-wrap gap-1">
                          {h.codeIds.map((id) => {
                            const c = codeById.get(id);
                            return c ? (
                              <span key={id} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs">
                                <span className="size-2 rounded-full" style={{ background: codeColorVar(c.color) }} aria-hidden />
                                {c.name}
                              </span>
                            ) : null;
                          })}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
