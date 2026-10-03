"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useMessages, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckIcon,
  CloudOffIcon,
  EyeIcon,
  Loader2Icon,
  MonitorIcon,
  PencilIcon,
  Redo2Icon,
  RocketIcon,
  Settings2Icon,
  SmartphoneIcon,
  Undo2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormRunner } from "@/components/form-runner/form-runner";
import type { RunnerLabels } from "@/components/form-runner/labels";
import { useMediaQuery } from "@/hooks/use-media-query";
import { FORM_LANGUAGES } from "@/lib/forms/i18n";
import type { PublishIssue } from "@/lib/forms/questions";
import { findQuestion, type FormDoc } from "@/lib/forms/schema";
import { stableStringify } from "@/lib/stable-json";
import { cn } from "@/lib/utils";
import { publishFormAction, saveFormDraftAction } from "@/server/actions/forms";
import { BuilderContext, type Selection } from "./context";
import { Canvas } from "./canvas";
import { FormSettings } from "./form-settings";
import { PageEditor } from "./page-editor";
import { QuestionEditor } from "./question-editor";
import { useFormDoc } from "./use-form-doc";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };

export function Builder({
  scope,
  formId,
  initialDoc,
  publishedDoc,
  publishedVersion: initialVersion,
  canEdit,
  captchaAvailable,
}: {
  scope: Scope;
  formId: string;
  initialDoc: FormDoc;
  publishedDoc: FormDoc | null;
  publishedVersion: number | null;
  canEdit: boolean;
  captchaAvailable: boolean;
}) {
  const t = useTranslations("builder");
  const te = useTranslations("errors");
  const messages = useMessages();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);

  const save = useCallback(
    async (doc: FormDoc) => {
      const res = await saveFormDraftAction(scope, formId, doc);
      return res.ok;
    },
    [scope, formId],
  );
  const { doc, update, undo, redo, canUndo, canRedo, status, flush } = useFormDoc(initialDoc, save, canEdit);

  const [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [previewLang, setPreviewLang] = useState(initialDoc.settings.defaultLanguage);
  const [publishedJson, setPublishedJson] = useState(() => (publishedDoc ? stableStringify(publishedDoc) : null));
  const [version, setVersion] = useState(initialVersion);
  const [issues, setIssues] = useState<PublishIssue[] | null>(null);
  const [publishing, startPublish] = useTransition();

  const dirtyVsPublished = useMemo(() => publishedJson !== stableStringify(doc), [publishedJson, doc]);

  // Keyboard: ⌘Z / ⇧⌘Z outside text fields (inputs keep their own undo), ⌘S saves now.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      const inField = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable=true]");
      if (key === "s") {
        e.preventDefault();
        void flush();
      } else if (key === "z" && !inField) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (key === "y" && !inField) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [flush, undo, redo]);

  // Drop the selection if the selected item disappears (undo, delete).
  const selected = useMemo(() => {
    if (selection?.kind === "question") return findQuestion(doc, selection.id) ? selection : null;
    if (selection?.kind === "page") return doc.pages.some((p) => p.id === selection.id) ? selection : null;
    return selection;
  }, [selection, doc]);

  const publish = () =>
    startPublish(async () => {
      if (!(await flush())) {
        toast.error(te("unknown"));
        return;
      }
      const res = await publishFormAction(scope, formId);
      if (res.ok) {
        setVersion(res.data.version);
        setPublishedJson(stableStringify(doc));
        toast.success(t("publishedToast", { version: res.data.version }));
      } else if ("issues" in res) {
        setIssues(res.issues);
      } else {
        toast.error(te(res.error));
      }
    });

  const ctx = useMemo(
    () => ({ doc, update, selection: selected, select: setSelection, canEdit, captchaAvailable }),
    [doc, update, selected, canEdit, captchaAvailable],
  );

  const panel = (
    <div className="grid gap-6">
      {selected?.kind === "question" ? (
        <QuestionEditor key={selected.id} question={findQuestion(doc, selected.id)!} />
      ) : selected?.kind === "page" ? (
        <PageEditor key={selected.id} page={doc.pages.find((p) => p.id === selected.id)!} />
      ) : (
        <FormSettings />
      )}
    </div>
  );

  const backHref = `/w/${scope.slug}/p/${scope.projectId}/s/${scope.studyId}`;
  const labels = (messages as unknown as { respondent: RunnerLabels }).respondent;
  const languages = [doc.settings.defaultLanguage, ...doc.settings.languages];

  return (
    <BuilderContext.Provider value={ctx}>
      <div className="flex h-[calc(100dvh-var(--header-height)-var(--tabbar-height)-env(safe-area-inset-bottom))] flex-col md:h-dvh">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-2 border-b bg-background/90 px-3 py-2 backdrop-blur sm:px-4">
          <Button asChild variant="ghost" size="icon-sm" aria-label={t("back")}>
            <Link href={backHref}>
              <ArrowLeftIcon className="rtl:rotate-180" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold sm:text-base">{doc.title || t("title")}</h1>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
              <SaveIndicator status={status} canEdit={canEdit} />
              <span aria-hidden>·</span>
              {version === null ? t("notPublished") : dirtyVsPublished ? t("unpublished") : `${t("published")} v${version}`}
            </p>
          </div>

          {canEdit && (
            <div className="hidden items-center sm:flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={undo} disabled={!canUndo} aria-label={t("undo")}>
                    <Undo2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("undo")} ⌘Z</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-sm" onClick={redo} disabled={!canRedo} aria-label={t("redo")}>
                    <Redo2Icon />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("redo")} ⇧⌘Z</TooltipContent>
              </Tooltip>
            </div>
          )}

          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as "edit" | "preview")} aria-label={t("preview")}>
            <ToggleGroupItem value="edit" aria-label={t("edit")}>
              <PencilIcon />
              <span className="hidden md:inline">{t("edit")}</span>
            </ToggleGroupItem>
            <ToggleGroupItem value="preview" aria-label={t("preview")}>
              <EyeIcon />
              <span className="hidden md:inline">{t("preview")}</span>
            </ToggleGroupItem>
          </ToggleGroup>

          <Button variant="ghost" size="icon-sm" aria-label={t("formSettings")} onClick={() => setSelection({ kind: "form" })} className={cn(selected?.kind === "form" && "bg-accent")}>
            <Settings2Icon />
          </Button>

          {canEdit && (
            <Button onClick={publish} disabled={publishing || (version !== null && !dirtyVsPublished)} size="sm" className="h-9">
              {publishing ? <Loader2Icon className="animate-spin" /> : version !== null && !dirtyVsPublished ? <CheckIcon /> : <RocketIcon />}
              <span className="hidden sm:inline">{version === null ? t("publish") : dirtyVsPublished ? t("publishChanges") : t("published")}</span>
            </Button>
          )}
        </div>

        {!canEdit && <p className="shrink-0 border-b bg-muted px-4 py-2 text-center text-sm text-muted-foreground">{t("readOnly")}</p>}

        <div className="flex min-h-0 flex-1">
          {view === "edit" ? (
            <div className="min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-2xl px-3 py-4 sm:px-6 sm:py-8">
                <Canvas />
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-muted/50">
              <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b bg-background/60 px-3 py-2">
                <ToggleGroup type="single" value={device} onValueChange={(v) => v && setDevice(v as "mobile" | "desktop")} aria-label={t("preview")} className="hidden sm:inline-flex">
                  <ToggleGroupItem value="mobile">
                    <SmartphoneIcon /> {t("mobile")}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="desktop">
                    <MonitorIcon /> {t("desktop")}
                  </ToggleGroupItem>
                </ToggleGroup>
                {languages.length > 1 && (
                  <Select value={previewLang} onValueChange={setPreviewLang}>
                    <SelectTrigger size="sm" className="w-40" aria-label={t("languages")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((l) => (
                        <SelectItem key={l} value={l}>
                          {FORM_LANGUAGES[l] ?? l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex min-h-0 flex-1 justify-center overflow-hidden sm:p-6">
                <div
                  className={cn(
                    "h-full w-full overflow-y-auto bg-background transition-[max-width] duration-200",
                    device === "mobile" && "sm:max-w-[390px] sm:rounded-[2rem] sm:border-8 sm:border-foreground/85 sm:shadow-lift",
                    device === "desktop" && "sm:rounded-2xl sm:border sm:shadow-lift",
                  )}
                >
                  <FormRunner key={`${previewLang}:${stableStringify(doc).length}`} doc={doc} lang={previewLang} labels={labels} mode="preview" className="min-h-full" />
                </div>
              </div>
            </div>
          )}

          {isDesktop && (
            <aside aria-label={t("formSettings")} className="w-[24rem] shrink-0 overflow-y-auto border-s bg-card/40 p-5">
              {selected === null && <p className="mb-5 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">{t("selectSomething")}</p>}
              {panel}
            </aside>
          )}
        </div>
      </div>

      {!isDesktop && (
        <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelection(null)}>
          <SheetContent side="bottom" className="h-[94dvh] max-h-[94dvh]" closeLabel={t("back")}>
            <SheetHeader className="pb-0">
              <SheetTitle>{selected?.kind === "question" ? t("questionSettings") : selected?.kind === "page" ? t("pageSettings") : t("formSettings")}</SheetTitle>
              <SheetDescription className="sr-only">{t("selectSomething")}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8">{panel}</div>
          </SheetContent>
        </Sheet>
      )}

      <Dialog open={!!issues} onOpenChange={(o) => !o && setIssues(null)}>
        <DialogContent closeLabel={t("back")}>
          <DialogHeader>
            <DialogTitle>{t("publishIssuesTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{t("publishIssuesTitle")}</DialogDescription>
          </DialogHeader>
          <ul className="grid gap-2">
            {issues?.map((issue, i) => {
              const q = issue.questionId ? findQuestion(doc, issue.questionId) : undefined;
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!q}
                    onClick={() => {
                      setIssues(null);
                      setView("edit");
                      if (q) setSelection({ kind: "question", id: q.id });
                    }}
                    className="flex w-full items-start gap-3 rounded-xl border p-3 text-start text-sm outline-none enabled:hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    <Badge variant="destructive">!</Badge>
                    <span>
                      {t(`issues.${issue.code}`)}
                      {q && <span className="block text-muted-foreground">{q.title || t("untitledQuestion")}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </BuilderContext.Provider>
  );
}

function SaveIndicator({ status, canEdit }: { status: string; canEdit: boolean }) {
  const t = useTranslations("builder");
  if (!canEdit) return null;
  if (status === "saving")
    return (
      <span className="inline-flex items-center gap-1">
        <Loader2Icon className="size-3 animate-spin" aria-hidden /> {t("saving")}
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex items-center gap-1 text-destructive">
        <CloudOffIcon className="size-3" aria-hidden /> {t("saveFailed")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1">
      <CheckIcon className="size-3" aria-hidden /> {t("saved")}
    </span>
  );
}
