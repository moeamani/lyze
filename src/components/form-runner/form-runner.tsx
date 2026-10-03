"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CopyIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerError, Answers, AnswerValue } from "@/lib/forms/answers";
import { computeState, firstPage, nextStep, pruneHidden, validatePage, visibleQuestions } from "@/lib/forms/logic";
import { localize } from "@/lib/forms/i18n";
import { pipe } from "@/lib/forms/piping";
import { seededShuffle } from "@/lib/forms/random";
import type { FormDoc, Question } from "@/lib/forms/schema";
import { Mascot } from "@/components/illustrations";
import { QuestionInput, isLabelable, type UploadedFile } from "./fields";
import { fmt, type RunnerLabels } from "./labels";
import { Captcha } from "./captcha";

type Screen =
  | { kind: "resume" }
  | { kind: "page" }
  | { kind: "done"; title: string; message: string; tone: "success" | "neutral" }
  | { kind: "blocked"; title: string; message: string };

type SaveState = "idle" | "saving" | "saved" | "offline";

export type FormRunnerProps = {
  doc: FormDoc;
  lang: string;
  labels: RunnerLabels;
  mode: "live" | "preview";
  publicId?: string;
  inviteToken?: string;
  resumeToken?: string;
  embed?: boolean;
  captchaSiteKey?: string | null;
  languages?: { code: string; label: string }[];
  className?: string;
};

class ApiError extends Error {
  constructor(
    public code: string,
    public details?: Record<string, AnswerError>,
  ) {
    super(code);
  }
}

async function api<T>(publicId: string, action: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/f/${publicId}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; details?: Record<string, AnswerError> };
  if (!res.ok) throw new ApiError(data.error ?? "server", data.details);
  return data as T;
}

function storageGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode — resume just won't be remembered */
  }
}

function deviceId() {
  let id = storageGet("lyze:device");
  if (!id) {
    id = crypto.randomUUID();
    storageSet("lyze:device", id);
  }
  return id;
}

type ResumePayload = { token: string; answers: Answers; pageId: string | null; doc: FormDoc };

export function FormRunner({
  doc: rawDoc,
  lang,
  labels,
  mode,
  publicId,
  inviteToken,
  resumeToken,
  embed,
  captchaSiteKey,
  languages,
  className,
}: FormRunnerProps) {
  const live = mode === "live" && !!publicId;
  const resumeKey = publicId ? `lyze:r:${publicId}` : "";

  const [baseDoc, setBaseDoc] = useState(rawDoc);
  useEffect(() => setBaseDoc(rawDoc), [rawDoc]);
  const doc = useMemo(() => localize(baseDoc, lang), [baseDoc, lang]);

  const [screen, setScreen] = useState<Screen>({ kind: "page" });
  const [pageIndex, setPageIndex] = useState(() => firstPage(rawDoc));
  const [history, setHistory] = useState<number[]>([]);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, AnswerError>>({});
  const [token, setToken] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<Record<string, UploadedFile>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showResumeLink, setShowResumeLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>();
  const honeypot = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(0);

  const state = useMemo(() => computeState(doc, answers), [doc, answers]);
  const needsCaptcha = live && !!captchaSiteKey && doc.settings.captcha;
  const page = doc.pages[pageIndex] ?? doc.pages[0]!;
  const seed = token ?? "preview";

  const pageQuestions = useMemo(() => {
    const visible = visibleQuestions(page, state);
    return page.shuffleQuestions ? seededShuffle(visible, `${seed}:${page.id}`) : visible;
  }, [page, state, seed]);

  const numbering = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const p of doc.pages) for (const q of p.questions) if (state.visible.has(q.id)) map.set(q.id, ++n);
    return map;
  }, [doc, state]);

  // ── Resume on load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!live) return;
    startedAt.current = Date.now();
    const saved = resumeToken || storageGet(resumeKey);
    if (saved) setScreen({ kind: "resume" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyResume = useCallback(
    (payload: ResumePayload) => {
      setToken(payload.token);
      setBaseDoc(payload.doc);
      setAnswers(payload.answers);
      const idx = payload.pageId ? payload.doc.pages.findIndex((p) => p.id === payload.pageId) : -1;
      if (idx >= 0) {
        // Rebuild the path the respondent took (through any logic) so "Back" still works.
        const resumed = localize(payload.doc, lang);
        const path: number[] = [];
        let at = firstPage(resumed, payload.answers);
        while (at !== idx && at < idx && path.length < resumed.pages.length) {
          path.push(at);
          const step = nextStep(resumed, at, payload.answers);
          if (step.type === "end") break;
          at = step.index;
        }
        setHistory(at === idx ? path : []);
        setPageIndex(idx);
      }
      if (payload.doc.settings.allowResume) storageSet(resumeKey, payload.token);
    },
    [resumeKey, lang],
  );

  const block = useCallback(
    (code: string) => {
      const map: Record<string, [string, string]> = {
        closed: [labels.closedTitle, labels.closedMessage],
        alreadyResponded: [labels.alreadyTitle, labels.alreadyMessage],
        inviteRequired: [labels.inviteTitle, labels.inviteMessage],
        notFound: [labels.notFoundTitle, labels.notFoundMessage],
      };
      const [title, message] = map[code] ?? [labels.errorTitle, labels.errorMessage];
      setScreen({ kind: "blocked", title, message });
      if (code !== "server") storageSet(resumeKey, null);
    },
    [labels, resumeKey],
  );

  const continueSaved = async () => {
    const saved = resumeToken || storageGet(resumeKey);
    setBusy(true);
    try {
      if (saved) applyResume(await api<ResumePayload>(publicId!, "resume", { token: saved }));
      setScreen({ kind: "page" });
    } catch (e) {
      storageSet(resumeKey, null);
      if (e instanceof ApiError && (e.code === "closed" || e.code === "alreadyResponded")) block(e.code);
      else setScreen({ kind: "page" });
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    storageSet(resumeKey, null);
    setScreen({ kind: "page" });
  };

  // ── Starting & saving ─────────────────────────────────────────────────────
  const starting = useRef<Promise<string | null> | null>(null);
  const ensureToken = useCallback(async (): Promise<string | null> => {
    if (!live) return "preview";
    if (token) return token;
    starting.current ??= (async () => {
      try {
        const payload = await api<ResumePayload>(publicId!, "start", {
          deviceId: deviceId(),
          invite: inviteToken,
          locale: lang,
          embed: embed || undefined,
        });
        // In one-response-per-device mode the server may hand back an earlier, unfinished response.
        const isResume = Object.keys(payload.answers).length > 0;
        setToken(payload.token);
        if (isResume) applyResume(payload);
        else if (payload.doc.settings.allowResume) storageSet(resumeKey, payload.token);
        return payload.token;
      } catch (e) {
        starting.current = null;
        if (e instanceof ApiError) block(e.code === "rateLimited" ? "server" : e.code);
        else setSaveState("offline");
        return null;
      }
    })();
    return starting.current;
  }, [live, token, publicId, inviteToken, lang, embed, applyResume, resumeKey, block]);

  const dirty = useRef<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const flush = useCallback(
    async (pageId?: string) => {
      if (!live) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const t = await ensureToken();
      if (!t) return;
      const keys = [...dirty.current];
      dirty.current.clear();
      if (!keys.length && !pageId) return;
      const payload: Record<string, AnswerValue | null> = {};
      for (const k of keys) payload[k] = answersRef.current[k] ?? null;
      setSaveState("saving");
      try {
        await api(publicId!, "save", { token: t, answers: payload, pageId });
        setSaveState("saved");
      } catch (e) {
        keys.forEach((k) => dirty.current.add(k));
        if (e instanceof ApiError && (e.code === "closed" || e.code === "alreadyResponded")) block(e.code);
        else setSaveState("offline");
      }
    },
    [live, ensureToken, publicId, block],
  );

  const setAnswer = (questionId: string, value: AnswerValue | undefined) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[questionId];
      else next[questionId] = value;
      return next;
    });
    setErrors((prev) => {
      if (!prev[questionId]) return prev;
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    if (!live) return;
    dirty.current.add(questionId);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 1200);
  };

  useEffect(() => {
    if (!live) return;
    const retry = () => saveState === "offline" && void flush();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [live, saveState, flush]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const focusHeading = () => {
    requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
      (embed ? rootRef.current : null)?.scrollIntoView({ block: "start" });
      if (!embed) window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    });
  };

  const focusFirstError = (errs: Record<string, AnswerError>) => {
    const first = pageQuestions.find((q) => errs[q.id]) ?? null;
    requestAnimationFrame(() => {
      if (!first) return;
      const el = document.getElementById(`q-${first.id}`);
      el?.scrollIntoView({ block: "center" });
      const focusable = el?.querySelector<HTMLElement>("input, textarea, select, button");
      focusable?.focus({ preventScroll: true });
    });
  };

  const upload = useCallback(
    async (questionId: string, file: File): Promise<UploadedFile> => {
      if (!live) {
        const fake = { id: `preview-${crypto.randomUUID()}`, name: file.name, size: file.size, mime: file.type };
        setFileInfo((m) => ({ ...m, [fake.id]: fake }));
        return fake;
      }
      const t = await ensureToken();
      if (!t) throw new Error(labels.errorMessage);
      const body = new FormData();
      body.set("token", t);
      body.set("questionId", questionId);
      body.set("file", file);
      const res = await fetch(`/api/f/${publicId}/upload`, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as UploadedFile & { error?: string };
      if (!res.ok) {
        throw new Error(data.error === "tooLarge" ? labels.fileTooLarge : data.error === "fileType" ? labels.fileType : labels.errorMessage);
      }
      setFileInfo((m) => ({ ...m, [data.id]: data }));
      return data;
    },
    [live, ensureToken, publicId, labels],
  );

  const submit = async () => {
    const clean = pruneHidden(answers, state);
    if (!live) {
      finish("complete");
      return;
    }
    if (needsCaptcha && !captchaToken) {
      setNotice(labels.captcha);
      return;
    }
    const t = await ensureToken();
    if (!t) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await api<{ status: string; message?: string }>(publicId!, "submit", {
        token: t,
        answers: clean,
        website: honeypot.current?.value || undefined,
        captcha: captchaToken,
      });
      storageSet(resumeKey, null);
      finish(res.status, res.message);
    } catch (e) {
      if (e instanceof ApiError && e.code === "invalid" && e.details) {
        const idx = doc.pages.findIndex((p) => p.questions.some((q) => e.details![q.id]));
        if (idx >= 0) {
          setPageIndex(idx);
          setErrors(e.details);
          setNotice(labels.fixErrors);
          focusHeading();
          return;
        }
      }
      if (e instanceof ApiError && (e.code === "closed" || e.code === "alreadyResponded" || e.code === "notFound")) block(e.code);
      else setNotice(e instanceof ApiError && e.code === "rateLimited" ? labels.rateLimited : e instanceof ApiError && e.code === "captcha" ? labels.captcha : labels.errorMessage);
    } finally {
      setBusy(false);
    }
  };

  const finish = (status: string, message?: string) => {
    if (status === "screened_out" || status === "over_quota") {
      const title = status === "over_quota" ? labels.overQuotaTitle : labels.screenedOutTitle;
      const fallback = status === "over_quota" ? labels.overQuotaMessage : labels.screenedOutMessage;
      setScreen({ kind: "done", title, message: message || fallback, tone: "neutral" });
    } else {
      setScreen({
        kind: "done",
        title: doc.settings.thankYouTitle || labels.thankYouTitle,
        message: message || doc.settings.thankYouMessage || labels.thankYouMessage,
        tone: "success",
      });
    }
    focusHeading();
  };

  const next = async () => {
    const errs = validatePage(page, answers, state);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setNotice(labels.fixErrors);
      focusFirstError(errs);
      return;
    }
    setNotice(null);
    const step = nextStep(doc, pageIndex, answers, state);
    if (step.type === "end") {
      // Screened-out respondents still submit (the server marks them), so researchers can count them.
      if (step.screenOut && !live) finish("screened_out", step.message);
      else await submit();
      return;
    }
    setHistory((h) => [...h, pageIndex]);
    setPageIndex(step.index);
    focusHeading();
    void flush(doc.pages[step.index]!.id);
  };

  const back = () => {
    const prev = history.at(-1);
    if (prev === undefined) return;
    setHistory((h) => h.slice(0, -1));
    setPageIndex(prev);
    setErrors({});
    setNotice(null);
    focusHeading();
  };

  const restartPreview = () => {
    setAnswers({});
    setErrors({});
    setHistory([]);
    setPageIndex(firstPage(doc));
    setScreen({ kind: "page" });
    setNotice(null);
  };

  // ── Embed auto-resize ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!embed || !rootRef.current || window.parent === window) return;
    const ro = new ResizeObserver(() => {
      window.parent.postMessage({ type: "lyze:resize", id: publicId, height: document.documentElement.scrollHeight }, "*");
    });
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [embed, publicId]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isLast = nextStep(doc, pageIndex, answers, state).type === "end";
  const totalPages = doc.pages.length;
  const progress = screen.kind === "done" ? 100 : Math.round((pageIndex / Math.max(1, totalPages)) * 100);
  const theme = doc.settings.theme;
  const resumeUrl = token && publicId && typeof window !== "undefined" ? `${window.location.origin}/f/${publicId}?resume=${token}` : "";

  return (
    <div
      ref={rootRef}
      className={cn(
        "form-theme flex min-h-full flex-col",
        theme.background === "tinted" && !embed && "bg-[radial-gradient(ellipse_at_top,var(--accent-soft),transparent_60%)]",
        className,
      )}
      data-accent={theme.accent}
      data-corners={theme.corners}
      lang={lang}
      dir={languageDir(lang)}
    >
      {mode === "preview" && (
        <div className="bg-accent-soft px-4 py-1.5 text-center text-xs font-medium text-accent-soft-foreground">{labels.previewBanner}</div>
      )}
      {doc.settings.progressBar && totalPages > 1 && screen.kind === "page" && (
        <div className="sticky top-0 z-10 h-1 w-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={fmt(labels.progress, { current: pageIndex + 1, total: totalPages })}>
          <div className="h-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${Math.max(progress, 3)}%` }} />
        </div>
      )}

      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-6 pb-8 sm:px-6 sm:pt-12">
        {languages && languages.length > 1 && screen.kind !== "done" && (
          <div className="mb-4 flex justify-end">
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="sr-only">{labels.language}</span>
              <select
                className="h-10 rounded-lg border bg-card px-2 text-sm text-foreground shadow-soft"
                value={lang}
                onChange={(e) => {
                  const url = new URL(window.location.href);
                  url.searchParams.set("lang", e.target.value);
                  window.location.assign(url.toString());
                }}
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {screen.kind === "resume" && (
          <section className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center animate-in fade-in-0 duration-300">
            <Mascot mood="happy" />
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-balance outline-none">
              {doc.title}
            </h1>
            <p className="text-muted-foreground">{labels.welcomeBack}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={continueSaved} disabled={busy} className={primaryButton}>
                {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
                {labels.continue}
              </button>
              <button type="button" onClick={startOver} className={secondaryButton}>
                {labels.startOver}
              </button>
            </div>
          </section>
        )}

        {(screen.kind === "done" || screen.kind === "blocked") && (
          <section className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center animate-in fade-in-0 zoom-in-95 duration-300" aria-live="polite">
            {screen.kind === "done" && screen.tone === "success" ? (
              <span className="grid size-16 place-items-center rounded-full bg-primary text-primary-foreground animate-in zoom-in-50 duration-500">
                <CheckIcon className="size-8" strokeWidth={2.5} aria-hidden />
              </span>
            ) : (
              <Mascot mood={screen.kind === "blocked" ? "sleepy" : "happy"} />
            )}
            <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-balance outline-none">
              {screen.title}
            </h1>
            <p className="max-w-md text-balance text-muted-foreground">{screen.message}</p>
            {mode === "preview" && (
              <button type="button" onClick={restartPreview} className={cn(secondaryButton, "mt-4")}>
                <RotateCcwIcon className="size-4" aria-hidden /> {labels.startOver}
              </button>
            )}
          </section>
        )}

        {screen.kind === "page" && (
          <form
            noValidate
            className="flex flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              void next();
            }}
          >
            <header className="mb-8 space-y-2">
              {pageIndex === 0 || history.length === 0 ? (
                <>
                  <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-balance outline-none sm:text-3xl">
                    {doc.title}
                  </h1>
                  {doc.description && <p className="text-pretty whitespace-pre-line text-muted-foreground">{doc.description}</p>}
                </>
              ) : (
                <p className="text-sm font-medium text-muted-foreground">{doc.title}</p>
              )}
              {(page.title || page.description) && (
                <div className={cn("space-y-1", pageIndex === 0 && history.length === 0 && "pt-4")}>
                  {page.title &&
                    (history.length === 0 ? (
                      <h2 className="text-xl font-semibold">{pipe(page.title, doc, answers)}</h2>
                    ) : (
                      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-balance outline-none">
                        {pipe(page.title, doc, answers)}
                      </h1>
                    ))}
                  {page.description && <p className="whitespace-pre-line text-muted-foreground">{pipe(page.description, doc, answers)}</p>}
                </div>
              )}
              {history.length > 0 && !page.title && (
                <h1 ref={headingRef} tabIndex={-1} className="sr-only">
                  {fmt(labels.progress, { current: pageIndex + 1, total: totalPages })}
                </h1>
              )}
            </header>

            <div className="flex flex-col gap-8" key={page.id}>
              {pageQuestions.map((q) => (
                <QuestionBlock
                  key={q.id}
                  question={q}
                  number={doc.settings.showQuestionNumbers ? numbering.get(q.id) : undefined}
                  required={state.required.has(q.id)}
                  title={pipe(q.title, doc, answers)}
                  description={q.description ? pipe(q.description, doc, answers) : undefined}
                  error={errors[q.id]}
                  labels={labels}
                >
                  {(ids) => (
                    <QuestionInput
                      question={q}
                      value={answers[q.id]}
                      onChange={(v) => setAnswer(q.id, v)}
                      labels={labels}
                      seed={seed}
                      inputId={ids.inputId}
                      describedBy={ids.describedBy}
                      invalid={!!errors[q.id]}
                      upload={upload}
                      fileInfo={fileInfo}
                    />
                  )}
                </QuestionBlock>
              ))}
            </div>

            {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
            <div aria-hidden className="absolute -start-[9999px] size-px overflow-hidden">
              <label>
                Website
                <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>

            {isLast && needsCaptcha && <Captcha siteKey={captchaSiteKey!} onToken={setCaptchaToken} />}

            {notice && (
              <p role="alert" className="mt-8 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                {notice}
              </p>
            )}

            <div className="sticky bottom-0 -mx-4 mt-10 flex items-center gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
              {history.length > 0 && (
                <button type="button" onClick={back} className={secondaryButton}>
                  <ArrowLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
                  {labels.back}
                </button>
              )}
              <button type="submit" disabled={busy} className={cn(primaryButton, "ms-auto min-w-32")}>
                {busy && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
                {busy ? labels.submitting : isLast ? labels.submit : labels.next}
                {!busy && !isLast && <ArrowRightIcon className="size-4 rtl:rotate-180" aria-hidden />}
              </button>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span aria-live="polite">
                {totalPages > 1 && fmt(labels.progress, { current: pageIndex + 1, total: totalPages })}
                {saveState === "saving" && ` · ${labels.saving}`}
                {saveState === "saved" && ` · ${labels.saved}`}
                {saveState === "offline" && ` · ${labels.offline}`}
              </span>
              {live && doc.settings.allowResume && token && (
                <button type="button" className="min-h-10 underline-offset-4 hover:text-foreground hover:underline" onClick={() => setShowResumeLink((s) => !s)} aria-expanded={showResumeLink}>
                  {labels.saveLater}
                </button>
              )}
            </div>
            {showResumeLink && resumeUrl && (
              <div className="mt-3 rounded-xl border bg-card p-4 text-sm shadow-soft animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
                <p className="font-medium">{labels.resumeTitle}</p>
                <p className="mt-1 text-muted-foreground">{labels.resumeBody}</p>
                <div className="mt-3 flex gap-2">
                  <input readOnly value={resumeUrl} aria-label={labels.resumeTitle} className="h-10 min-w-0 flex-1 rounded-lg border bg-muted px-3 text-xs" onFocus={(e) => e.target.select()} />
                  <button
                    type="button"
                    className={cn(secondaryButton, "h-10 min-h-0")}
                    onClick={async () => {
                      await flush();
                      await navigator.clipboard?.writeText(resumeUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? <CheckIcon className="size-4" aria-hidden /> : <CopyIcon className="size-4" aria-hidden />}
                    {copied ? labels.copied : labels.copy}
                  </button>
                </div>
              </div>
            )}
          </form>
        )}

        {!embed && (
          <p className="mt-10 text-center text-xs text-muted-foreground">
            {/* Plain link: respondent pages use a separate root layout, so this is a full navigation anyway. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/" className="underline-offset-4 hover:underline">
              {labels.madeWith}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}

const primaryButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-medium text-primary-foreground shadow-soft outline-none transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.98] disabled:opacity-60 focus-visible:ring-[3px] focus-visible:ring-ring/40";
const secondaryButton =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-card px-4 text-base font-medium shadow-soft outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40";

function languageDir(lang: string) {
  return ["ar", "fa", "he", "ur"].includes(lang.split("-")[0]!) ? "rtl" : "ltr";
}

function QuestionBlock({
  question,
  number,
  required,
  title,
  description,
  error,
  labels,
  children,
}: {
  question: Question;
  number?: number;
  required: boolean;
  title: string;
  description?: string;
  error?: AnswerError;
  labels: RunnerLabels;
  children: (ids: { inputId: string; describedBy?: string }) => React.ReactNode;
}) {
  const inputId = `input-${question.id}`;
  const titleId = `title-${question.id}`;
  const descId = description ? `desc-${question.id}` : undefined;
  const errId = error ? `err-${question.id}` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(" ") || undefined;
  const labelable = isLabelable(question);
  const TitleTag = labelable ? "label" : "p";

  // Single inputs are named by their <label>; grouped inputs (radios, grids…) by a labelled group.
  return (
    <div
      id={`q-${question.id}`}
      role={labelable ? undefined : "group"}
      aria-labelledby={labelable ? undefined : titleId}
      className={cn("scroll-mt-24 rounded-2xl transition-colors", error && "-mx-3 bg-destructive/5 px-3 py-3 sm:-mx-4 sm:px-4")}
    >
      <div className="mb-3 space-y-1">
        <TitleTag id={titleId} {...(TitleTag === "label" ? { htmlFor: inputId } : {})} className="block text-lg leading-snug font-medium text-pretty">
          {number !== undefined && <span className="me-1.5 text-muted-foreground tabular-nums">{number}.</span>}
          {title}
          {required ? (
            <span className="ms-1 text-destructive" aria-hidden>
              *
            </span>
          ) : null}
          {required && <span className="sr-only"> ({labels.required})</span>}
        </TitleTag>
        {description && (
          <p id={descId} className="text-sm whitespace-pre-line text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children({ inputId, describedBy })}
      {error && (
        <p id={errId} className="mt-2 text-sm font-medium text-destructive" role="alert">
          {labels.errors[error]}
        </p>
      )}
    </div>
  );
}
