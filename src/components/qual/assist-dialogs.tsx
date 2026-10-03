"use client";

import { AiModeSelect, useAiMode } from "@/components/common/ai-mode";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, PlusIcon, ScrollTextIcon, SparklesIcon, CheckIcon, ShapesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { clusterQuestionAction, createCodeFromClusterAction, summarizeSessionAction } from "@/server/actions/coding";
import { saveSummaryAction } from "@/server/actions/interviews";
import { CODE_COLORS } from "@/lib/qual/codes";

type Scope = { workspaceId: string; slug: string; projectId: string };

/** Badge that marks everything the assistant produced as a suggestion. */
export function SuggestionBadge({ assistant }: { assistant: "builtin" | "claude" }) {
  const t = useTranslations("coding.assist");
  return (
    <Badge variant="outline" className="gap-1">
      <SparklesIcon className="size-3" aria-hidden />
      {t(assistant === "claude" ? "byClaude" : "byBuiltin")}
    </Badge>
  );
}

export function SummarizeButton({ scope, sessionId, studyId, canSave, assistant }: { scope: Scope; sessionId: string; studyId: string; canSave: boolean; assistant: "builtin" | "claude" }) {
  const t = useTranslations("coding.assist");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState<string[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode] = useAiMode();
  const run = () =>
    startTransition(async () => {
      setOpen(true);
      setPoints(null);
      const result = await summarizeSessionAction(scope, sessionId, mode);
      if (feedback(result) && result.ok) setPoints(result.data.points);
      else setOpen(false);
    });
  return (
    <>
      <AiModeSelect />
      <Button variant="outline" size="sm" onClick={run} disabled={pending}>
        {pending ? <Loader2Icon className="animate-spin" /> : <ScrollTextIcon />}
        {t("summarize")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("close")} className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{t("summaryTitle")}</DialogTitle>
              <SuggestionBadge assistant={assistant} />
            </div>
            <DialogDescription>{t("summaryHint")}</DialogDescription>
          </DialogHeader>
          {!points ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              {t("working")}
            </p>
          ) : points.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("nothingToSummarize")}</p>
          ) : (
            <ul className="grid list-disc gap-2 ps-5 text-sm">
              {points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("discard")}
            </Button>
            {canSave && points && points.length > 0 && (
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const studyScope = { workspaceId: scope.workspaceId, slug: scope.slug, projectId: scope.projectId, studyId };
                    if (feedback(await saveSummaryAction(studyScope, sessionId, points.map((p) => `• ${p}`).join("\n")), t("summarySaved"))) setOpen(false);
                  })
                }
              >
                <CheckIcon />
                {t("useSummary")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Cluster = { label: string; description: string | null; answerIds: string[]; example: string };

export function ClusterButton({ scope, studyId, questionId, assistant, codesCount }: { scope: Scope; studyId: string; questionId: string; assistant: "builtin" | "claude"; codesCount: number }) {
  const t = useTranslations("coding.assist");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [clusters, setClusters] = useState<(Cluster & { name: string; done: boolean })[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode] = useAiMode();
  const run = () =>
    startTransition(async () => {
      setOpen(true);
      setClusters(null);
      const result = await clusterQuestionAction(scope, studyId, questionId, mode);
      if (feedback(result) && result.ok) setClusters(result.data.clusters.map((c) => ({ ...c, name: c.label.replace(/\s*\/\s*/g, " & ").slice(0, 80), done: false })));
      else setOpen(false);
    });
  return (
    <>
      <AiModeSelect />
      <Button variant="outline" size="sm" onClick={run} disabled={pending}>
        {pending && !open ? <Loader2Icon className="animate-spin" /> : <ShapesIcon />}
        {t("cluster")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("close")} className="sm:max-w-2xl">
          <DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>{t("clusterTitle")}</DialogTitle>
              <SuggestionBadge assistant={assistant} />
            </div>
            <DialogDescription>{t("clusterHint")}</DialogDescription>
          </DialogHeader>
          {!clusters ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2Icon className="size-4 animate-spin" aria-hidden />
              {t("working")}
            </p>
          ) : (
            <ul className="grid max-h-[60dvh] gap-3 overflow-y-auto">
              {clusters.map((c, i) => (
                <li key={i} className="grid gap-2 rounded-xl border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={c.name}
                      disabled={c.done}
                      onChange={(e) => setClusters((all) => all!.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      aria-label={t("codeName", { n: i + 1 })}
                      className="h-9 max-w-xs flex-1"
                    />
                    <span className="text-xs text-muted-foreground">{t("answers", { count: c.answerIds.length })}</span>
                    <Button
                      size="sm"
                      variant={c.done ? "ghost" : "secondary"}
                      className="ms-auto"
                      disabled={pending || c.done || !c.name.trim()}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await createCodeFromClusterAction(scope, { name: c.name.trim(), color: CODE_COLORS[(codesCount + i) % CODE_COLORS.length], definition: c.description }, c.answerIds);
                          if (feedback(result, result.ok ? t("clusterCoded", { count: result.data.applied }) : undefined)) setClusters((all) => all!.map((x, j) => (j === i ? { ...x, done: true } : x)));
                        })
                      }
                    >
                      {c.done ? <CheckIcon /> : <PlusIcon />}
                      {c.done ? t("created") : t("createCode")}
                    </Button>
                  </div>
                  {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                  {c.example && <p className="rounded-lg bg-muted/60 p-2 text-sm">“{c.example}”</p>}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
