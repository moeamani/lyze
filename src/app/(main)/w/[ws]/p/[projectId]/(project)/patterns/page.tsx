import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DownloadIcon, SigmaIcon } from "lucide-react";
import { getProjectContext } from "@/server/queries/workspace";
import { patternsData, sharedUnits } from "@/server/services/patterns";
import { coderAgreement, comparableAttributes, compareGroups, cooccurrence, kappaLabel, type CountTest, type GroupComparison, type Measure } from "@/lib/qual/patterns";
import { codeColorVar } from "@/lib/qual/codes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SectionIntro } from "@/components/common/section-icon";
import { ParamSelect } from "@/components/qual/param-select";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("patterns");
  return { title: t("title") };
}

const VIEWS = ["groups", "together", "agreement"] as const;
type View = (typeof VIEWS)[number];

const fmtP = (p: number) => (p < 0.001 ? "< .001" : p.toFixed(3).replace(/^0/, ""));
const pct = (x: number) => `${Math.round(x * 100)}%`;

function CodeName({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="size-2 shrink-0 rounded-full" style={{ background: codeColorVar(color) }} aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

export default async function PatternsPage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/patterns">) {
  const { ws, projectId } = await params;
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const view: View = (VIEWS as readonly string[]).includes(one("view") ?? "") ? (one("view") as View) : "groups";
  const { workspace, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("patterns");
  const base = `/w/${ws}/p/${projectId}/patterns`;
  const data = await patternsData(workspace.id, project.id);

  return (
    <div className="grid grid-cols-1 gap-5">
      <SectionIntro
        section="coding"
        icon={SigmaIcon}
        title={t("title")}
        description={t("intro")}
        actions={
          <Button asChild variant="outline" size="sm">
            <a href={`/api/projects/${project.id}/export?format=cases`} download>
              <DownloadIcon /> {t("downloadCsv")}
            </a>
          </Button>
        }
      />
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
      {!data.codings.length ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-pretty text-muted-foreground">{t("noCodings")}</p>
      ) : view === "groups" ? (
        <Groups data={data} attribute={one("attr")} measure={one("measure") === "count" ? "count" : "presence"} countTest={one("test") === "anova" ? "anova" : "nonparametric"} />
      ) : view === "together" ? (
        <Together data={data} />
      ) : (
        <Agreement data={data} a={one("a")} b={one("b")} />
      )}
    </div>
  );
}

type Data = Awaited<ReturnType<typeof patternsData>>;

async function Groups({ data, attribute, measure, countTest }: { data: Data; attribute: string | null; measure: Measure; countTest: CountTest }) {
  const t = await getTranslations("patterns");
  const attributes = comparableAttributes(data.people);
  if (!attributes.length) return <p className="rounded-xl border border-dashed p-6 text-sm text-pretty text-muted-foreground">{t("noAttributes")}</p>;
  const attr = attribute && attributes.includes(attribute) ? attribute : attributes[0]!;
  const result: GroupComparison = compareGroups(data.people, data.codings, data.codes, attr, measure, countTest);
  const small = result.groups.some((g) => g.n < 5);
  return (
    <section className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ParamSelect param="attr" value={attr} label={t("attribute")} options={attributes.map((a) => ({ value: a, label: t("byAttribute", { name: a }) }))} />
        <ParamSelect
          param="measure"
          value={measure}
          label={t("measure")}
          options={[
            { value: "presence", label: t("measurePresence") },
            { value: "count", label: t("measureCount") },
          ]}
        />
        {measure === "count" && (
          <ParamSelect
            param="test"
            value={countTest}
            label={t("testLabel")}
            options={[
              { value: "nonparametric", label: result.groups.length === 2 ? t("testMannWhitney") : t("testKruskal") },
              { value: "anova", label: t("testAnova") },
            ]}
          />
        )}
      </div>
      <p className="text-sm text-pretty text-muted-foreground">
        {measure === "presence" ? t("presenceHint") : countTest === "anova" ? t("anovaHint") : t("countHint")} {result.missing > 0 && t("missing", { count: result.missing })}
      </p>
      {small && <p className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-pretty">{t("smallGroups")}</p>}
      <div className="relative overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">{t("tableCaption", { attribute: attr })}</caption>
          <thead className="bg-muted/50 text-start text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("code")}</th>
              {result.groups.map((g) => (
                <th key={g.value} scope="col" className="px-3 py-2 text-end font-medium">
                  <span className="block text-foreground">{g.value}</span>
                  <span className="font-normal">n = {g.n}</span>
                </th>
              ))}
              <th scope="col" className="px-3 py-2 text-end font-medium">{t("test")}</th>
              <th scope="col" className="px-3 py-2 text-end font-medium">p</th>
              <th scope="col" className="px-3 py-2 text-end font-medium">{t("pHolm")}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => {
              const max = Math.max(...r.cells.map((c) => (measure === "presence" ? c.share : c.mean)), 1e-9);
              return (
                <tr key={r.code.id} className="border-t">
                  <th scope="row" className="max-w-56 px-3 py-2 text-start font-normal">
                    <CodeName name={r.code.name} color={r.code.color} />
                  </th>
                  {r.cells.map((c, i) => {
                    const v = measure === "presence" ? c.share : c.mean;
                    return (
                      <td key={i} className="px-3 py-2 text-end tabular-nums" style={{ background: `color-mix(in oklab, var(--section-coding) ${Math.round((v / max) * 18)}%, transparent)` }}>
                        {measure === "presence" ? (
                          <>
                            {c.people}/{result.groups[i]!.n} <span className="text-muted-foreground">· {pct(c.share)}</span>
                          </>
                        ) : (
                          <>
                            {c.mean.toFixed(1)} <span className="text-muted-foreground">· {c.passages}</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-end text-xs whitespace-nowrap text-muted-foreground">
                    {r.test ? (
                      <>
                        {t(`testName.${r.test.name}`)}
                        {r.test.statistic !== null && ` ${r.test.statistic.toFixed(2)}`}
                        {r.test.df !== null && ` (${r.test.df})`}
                        {r.test.caution && (
                          <span title={t("caution")} className="ms-1">
                            <span aria-hidden>⚠</span>
                            <span className="sr-only">{t("caution")}</span>
                          </span>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cn("px-3 py-2 text-end tabular-nums", r.test && r.test.p < 0.05 && "font-semibold")}>{r.test ? fmtP(r.test.p) : "—"}</td>
                  <td className={cn("px-3 py-2 text-end tabular-nums", r.test && r.test.pAdjusted < 0.05 && "font-semibold text-section-coding")}>{r.test ? fmtP(r.test.pAdjusted) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-pretty text-muted-foreground">{measure === "presence" ? t("cellPresence") : t("cellCount")} {t("holmNote")}</p>
    </section>
  );
}

async function Together({ data }: { data: Data }) {
  const t = await getTranslations("patterns");
  const { pairs, units } = cooccurrence(data.codings, data.codes);
  if (!pairs.length) return <p className="rounded-xl border border-dashed p-6 text-sm text-pretty text-muted-foreground">{t("noPairs")}</p>;
  return (
    <section className="grid grid-cols-1 gap-3">
      <p className="text-sm text-pretty text-muted-foreground">{t("togetherHint")}</p>
      <div className="relative overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[28rem] text-sm">
          <caption className="sr-only">{t("view.together")}</caption>
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-start font-medium">{t("pair")}</th>
              <th scope="col" className="px-3 py-2 text-end font-medium">{t("together")}</th>
              <th scope="col" className="px-3 py-2 text-end font-medium">{t("overlap")}</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={`${p.a.id}-${p.b.id}`} className="border-t">
                <th scope="row" className="px-3 py-2 text-start font-normal">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <CodeName name={p.a.name} color={p.a.color} /> <span className="text-muted-foreground">+</span> <CodeName name={p.b.name} color={p.b.color} />
                  </span>
                </th>
                <td className="px-3 py-2 text-end tabular-nums">
                  {p.together} <span className="text-xs text-muted-foreground">/ {units.get(p.a.id)} · {units.get(p.b.id)}</span>
                </td>
                <td className="px-3 py-2 text-end tabular-nums">{pct(p.jaccard)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-pretty text-muted-foreground">{t("overlapNote")}</p>
    </section>
  );
}

async function Agreement({ data, a, b }: { data: Data; a: string | null; b: string | null }) {
  const t = await getTranslations("patterns");
  if (data.coders.length < 2) return <p className="rounded-xl border border-dashed p-6 text-sm text-pretty text-muted-foreground">{t("needTwoCoders")}</p>;
  const ids = data.coders.map((c) => c.id);
  const coderA = a && ids.includes(a) ? a : ids[0]!;
  const coderB = b && ids.includes(b) && b !== coderA ? b : ids.find((id) => id !== coderA)!;
  const units = await sharedUnits(data.human, coderA, coderB);
  const result = coderAgreement(data.human, data.codes, coderA, coderB, units);
  const options = data.coders.map((c) => ({ value: c.id, label: c.name }));
  return (
    <section className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ParamSelect param="a" value={coderA} label={t("coderA")} options={options} />
        <span className="text-muted-foreground">{t("and")}</span>
        <ParamSelect param="b" value={coderB} label={t("coderB")} options={options.filter((o) => o.value !== coderA)} />
      </div>
      {!units.length || !result.pooled ? (
        <p className="rounded-xl border border-dashed p-6 text-sm text-pretty text-muted-foreground">{t("noSharedTranscripts")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl border bg-card p-4">
            <p className="text-3xl font-semibold tabular-nums">κ = {result.pooled.kappa === null ? "—" : result.pooled.kappa.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">
              {result.pooled.kappa !== null && t(`kappa.${kappaLabel(result.pooled.kappa)}`)} · {t("agreementSummary", { agreement: pct(result.pooled.agreement), units: result.units })}
            </p>
          </div>
          <div className="relative overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[32rem] text-sm">
              <caption className="sr-only">{t("view.agreement")}</caption>
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t("code")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("both")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("onlyA")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("onlyB")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">{t("agree")}</th>
                  <th scope="col" className="px-3 py-2 text-end font-medium">κ</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.code.id} className="border-t">
                    <th scope="row" className="max-w-56 px-3 py-2 text-start font-normal">
                      <CodeName name={r.code.name} color={r.code.color} />
                    </th>
                    <td className="px-3 py-2 text-end tabular-nums">{r.both}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{r.onlyA}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{r.onlyB}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{pct(r.agreement)}</td>
                    <td className={cn("px-3 py-2 text-end tabular-nums", r.kappa !== null && r.kappa < 0.6 && "underline decoration-warning decoration-2 underline-offset-4")}>{r.kappa === null ? "—" : r.kappa.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-pretty text-muted-foreground">{t("kappaNote")}</p>
        </>
      )}
    </section>
  );
}
