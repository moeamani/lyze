import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GitMergeIcon, MessagesSquareIcon, ClipboardListIcon } from "lucide-react";
import { getProjectContext } from "@/server/queries/workspace";
import { caseMatrix, closedQuestions, codeByQuestion, jointDisplay, type Convergence } from "@/server/services/mixed";
import { codeColorVar } from "@/lib/qual/codes";
import { cn } from "@/lib/utils";
import { SectionIntro } from "@/components/common/section-icon";
import { QuestionPicker } from "@/components/mixed/question-picker";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mixedMethods");
  return { title: t("title") };
}

const VIEWS = ["joint", "cross", "cases"] as const;

const CONVERGENCE: Record<Convergence, string> = {
  both: "bg-section-mixed/15 text-foreground",
  qual: "bg-section-interviews/15 text-foreground",
  quant: "bg-section-forms/15 text-foreground",
};

function Chip({ name, color, count }: { name: string; color: string; count?: number }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs">
      <span className="size-2 shrink-0 rounded-full" style={{ background: codeColorVar(color) }} aria-hidden />
      <span className="truncate">{name}</span>
      {count !== undefined && <span className="text-muted-foreground tabular-nums">{count}</span>}
    </span>
  );
}

export default async function MixedPage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/mixed">) {
  const { ws, projectId } = await params;
  const sp = await searchParams;
  const view = (VIEWS as readonly string[]).includes(String(sp.view)) ? (sp.view as (typeof VIEWS)[number]) : "joint";
  const { workspace, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("mixedMethods");
  const base = `/w/${ws}/p/${projectId}/mixed`;

  return (
    <div className="grid grid-cols-1 gap-5">
      <SectionIntro section="mixed" icon={GitMergeIcon} title={t("title")} description={t("intro")} />
      <div role="tablist" aria-label={t("views")} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-fit">
        {VIEWS.map((v) => (
          <Link
            key={v}
            role="tab"
            aria-selected={view === v}
            href={`${base}?view=${v}`}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground", view === v && "bg-background text-foreground shadow-soft")}
          >
            {t(`view.${v}`)}
          </Link>
        ))}
      </div>
      {view === "joint" && <Joint workspaceId={workspace.id} projectId={project.id} />}
      {view === "cross" && <Cross workspaceId={workspace.id} projectId={project.id} q={typeof sp.q === "string" ? sp.q : null} />}
      {view === "cases" && <Cases workspaceId={workspace.id} projectId={project.id} base={`/w/${ws}/p/${projectId}`} />}
    </div>
  );
}

async function Joint({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
  const t = await getTranslations("mixedMethods");
  const { rows, respondents, sessions } = await jointDisplay(workspaceId, projectId);
  const used = rows.filter((r) => r.convergence);
  if (!used.length) return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("emptyJoint")}</p>;
  const counts = { both: used.filter((r) => r.convergence === "both").length, qual: used.filter((r) => r.convergence === "qual").length, quant: used.filter((r) => r.convergence === "quant").length };
  return (
    <section aria-labelledby="joint-title" className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="joint-title" className="font-semibold">{t("jointTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("jointMeta", { sessions, respondents })}</p>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["both", "qual", "quant"] as const).map((k) => (
          <li key={k} className={cn("rounded-lg px-3 py-2", CONVERGENCE[k])}>
            <p className="text-2xl font-semibold tabular-nums">{counts[k]}</p>
            <p className="text-sm">{t(`convergence.${k}`)}</p>
            <p className="text-xs text-foreground/75">{t(`convergenceHint.${k}`)}</p>
          </li>
        ))}
      </ul>
      <div className="overflow-hidden rounded-xl border">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t("jointTitle")}</caption>
          <thead className="bg-muted/60 text-start text-xs text-muted-foreground max-md:hidden">
            <tr>
              <th scope="col" className="w-[24%] px-3 py-2 text-start font-medium">{t("code")}</th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                <span className="inline-flex items-center gap-1.5"><MessagesSquareIcon className="size-3.5 text-section-interviews" aria-hidden />{t("conversations")}</span>
              </th>
              <th scope="col" className="px-3 py-2 text-start font-medium">
                <span className="inline-flex items-center gap-1.5"><ClipboardListIcon className="size-3.5 text-section-forms" aria-hidden />{t("survey")}</span>
              </th>
              <th scope="col" className="w-32 px-3 py-2 text-start font-medium">{t("where")}</th>
            </tr>
          </thead>
          <tbody>
            {used.map((r) => (
              <tr key={r.codeId} className="border-t align-top max-md:grid max-md:gap-2 max-md:p-3">
                <th scope="row" className="px-3 py-2.5 text-start font-medium max-md:p-0">
                  <span className="flex items-center gap-2" style={{ paddingInlineStart: `${r.depth * 0.75}rem` }}>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: codeColorVar(r.color) }} aria-hidden />
                    <span className="min-w-0 break-words">{r.name}</span>
                  </span>
                </th>
                <td className="px-3 py-2.5 max-md:p-0">
                  <p className="text-xs text-muted-foreground"><span className="md:hidden">{t("conversations")}: </span>{r.qual.passages ? t("qualCount", { passages: r.qual.passages, people: r.qual.people }) : "—"}</p>
                  {r.qual.quote && <p dir="auto" className="mt-1 line-clamp-3 text-start text-[0.82rem] text-pretty">“{r.qual.quote}”</p>}
                </td>
                <td className="px-3 py-2.5 max-md:p-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground"><span className="md:hidden">{t("survey")}: </span>{r.quant.respondents ? t("quantCount", { share: Math.round(r.quant.share * 100), n: r.quant.respondents }) : "—"}</span>
                  </div>
                  {r.quant.respondents > 0 && (
                    <div className="mt-1 h-1.5 w-full max-w-40 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full rounded-full bg-section-forms" style={{ width: `${Math.max(3, r.quant.share * 100)}%` }} />
                    </div>
                  )}
                  {r.quant.quote && <p dir="auto" className="mt-1 line-clamp-3 text-start text-[0.82rem] text-pretty">“{r.quant.quote}”</p>}
                </td>
                <td className="px-3 py-2.5 max-md:p-0">
                  {r.convergence && <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-medium", CONVERGENCE[r.convergence])}>{t(`convergence.${r.convergence}`)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function Cross({ workspaceId, projectId, q }: { workspaceId: string; projectId: string; q: string | null }) {
  const t = await getTranslations("mixedMethods");
  const questions = await closedQuestions(workspaceId, projectId);
  if (!questions.length) return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("emptyCross")}</p>;
  const chosen = q && questions.some((x) => `${x.studyId}:${x.questionId}` === q) ? q : `${questions[0]!.studyId}:${questions[0]!.questionId}`;
  const [studyId, questionId] = chosen.split(":") as [string, string];
  const data = await codeByQuestion(workspaceId, projectId, studyId, questionId);
  return (
    <section aria-labelledby="cross-title" className="grid grid-cols-1 gap-3">
      <div className="grid gap-1">
        <h3 id="cross-title" className="font-semibold">{t("crossTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("crossHint")}</p>
      </div>
      <QuestionPicker questions={questions} value={chosen} label={t("pickQuestion")} />
      {!data || !data.rows.length ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("noCodedAnswers")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">{data.question}</caption>
            <thead className="bg-muted/60 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">{t("code")}</th>
                <th scope="col" className="px-2 py-2 text-end font-medium">n</th>
                {data.kind === "scale" && <th scope="col" className="px-2 py-2 text-end font-medium">{t("mean")}</th>}
                {data.labels.map((l) => (
                  <th key={l} scope="col" className="px-2 py-2 text-end font-medium">{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[{ ...data.all, name: t("everyone") }, ...data.rows].map((r, i) => (
                <tr key={r.codeId ?? "all"} className={cn("border-t", i === 0 && "bg-muted/30 font-medium")}>
                  <th scope="row" className="px-3 py-2 text-start font-medium">
                    <span className="flex items-center gap-2">
                      {r.color && <span className="size-2.5 shrink-0 rounded-full" style={{ background: codeColorVar(r.color) }} aria-hidden />}
                      {r.name}
                    </span>
                  </th>
                  <td className="px-2 py-2 text-end tabular-nums">{r.n}</td>
                  {data.kind === "scale" && <td className="px-2 py-2 text-end tabular-nums">{r.mean !== null ? r.mean.toFixed(1) : "—"}</td>}
                  {r.percents.map((p, j) => (
                    <td key={j} className="px-1 py-1 text-end tabular-nums">
                      <span className="block rounded px-1.5 py-1" style={{ background: `color-mix(in oklab, var(--section-mixed) ${Math.round(Math.min(p, 100) * 0.55)}%, transparent)` }}>
                        {Math.round(p)}%
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t("crossNote")}</p>
    </section>
  );
}

async function Cases({ workspaceId, projectId, base }: { workspaceId: string; projectId: string; base: string }) {
  const t = await getTranslations("mixedMethods");
  const rows = await caseMatrix(workspaceId, projectId);
  if (!rows.length) return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("emptyCases")}</p>;
  const both = rows.filter((r) => r.sessions && r.responses).length;
  return (
    <section aria-labelledby="cases-title" className="grid grid-cols-1 gap-3">
      <div className="grid gap-1">
        <h3 id="cases-title" className="font-semibold">{t("casesTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("casesHint", { both, total: rows.length })}</p>
      </div>
      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`${base}/s/${r.studyId}/participants/${r.id}`} className="font-semibold hover:underline">{r.code}</Link>
              <span className="text-xs text-muted-foreground">{r.studyName}</span>
              <span className="ms-auto flex gap-1 text-xs">
                <span className={cn("rounded-md px-1.5 py-0.5", r.sessions ? "bg-section-interviews/15" : "bg-muted text-muted-foreground")}>{t("sessionsCount", { count: r.sessions })}</span>
                <span className={cn("rounded-md px-1.5 py-0.5", r.responses ? "bg-section-forms/15" : "bg-muted text-muted-foreground")}>{t("responsesCount", { count: r.responses })}</span>
              </span>
            </div>
            {Object.keys(r.attributes).length > 0 && (
              <p className="text-xs text-muted-foreground">
                {Object.entries(r.attributes).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </p>
            )}
            <div className="flex flex-wrap gap-1">
              {r.codes.length ? r.codes.slice(0, 6).map((c) => <Chip key={c.id} name={c.name} color={c.color} count={c.count} />) : <span className="text-xs text-muted-foreground">{t("noCodes")}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
