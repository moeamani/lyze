"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FlaskConicalIcon, KeyRoundIcon, SparklesIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AiMode } from "@/server/ai";
import { cn } from "@/lib/utils";
import { providerLabel } from "@/lib/ai-providers";

type AiContext = {
  workspaceId: string;
  /** Ana is available (the server has a key). */
  lyze: boolean;
  /** Provider id of the workspace's own key, if it has one. */
  own: string | null;
  /** Dev Mode is on for this person: Placeholder and test data are offered. */
  canPlaceholder: boolean;
  settingsHref: string;
};
const Ctx = createContext<AiContext | null>(null);

export function AiModeProvider({ value, children }: { value: AiContext; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const EVENT = "lyze:ai-mode";
const keyFor = (ws: string) => `lyze:ai-source:${ws}`;
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
function read(ws: string): string | null {
  try {
    return localStorage.getItem(keyFor(ws));
  } catch {
    return null;
  }
}

/** The sources this person can pick from, in menu order. */
function options(ctx: AiContext | null): AiMode[] {
  if (!ctx) return [];
  return [...(ctx.lyze ? (["lyze"] as const) : []), ...(ctx.own ? (["own"] as const) : []), ...(ctx.canPlaceholder ? (["placeholder"] as const) : [])];
}

/**
 * Where generated text comes from in this workspace: Ana, the workspace's own key, or (Dev Mode
 * only) the offline Placeholder. A workspace with its own key uses it by default; the choice is
 * remembered per workspace in this browser.
 */
export function useAiMode(): [AiMode, (m: AiMode) => void, AiContext | null, AiMode[]] {
  const ctx = useContext(Ctx);
  const ws = ctx?.workspaceId ?? "";
  const stored = useSyncExternalStore(subscribe, () => read(ws), () => null);
  const available = options(ctx);
  const fallback: AiMode = ctx?.own ? "own" : (available[0] ?? "lyze");
  const mode: AiMode = available.find((m) => m === stored) ?? fallback;
  const set = useCallback(
    (m: AiMode) => {
      try {
        localStorage.setItem(keyFor(ws), m);
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [ws],
  );
  return [mode, set, ctx, available];
}

/** The id generated text is labelled with: "lyze", the own provider's id, or "builtin". */
export function useAssistant() {
  const [mode, , ctx] = useAiMode();
  return mode === "placeholder" ? "builtin" : mode === "own" ? (ctx?.own ?? "builtin") : "lyze";
}

/** Ana / your own key / Placeholder, next to a generate button. Hidden when there's only one choice. */
export function AiModeSelect({ className }: { className?: string }) {
  const t = useTranslations("ai");
  const [mode, setMode, ctx, available] = useAiMode();
  if (!ctx) return null;
  if (!available.length)
    return (
      <Link href={ctx.settingsHref} className={cn("text-xs text-muted-foreground underline-offset-2 hover:underline", className)}>
        {t("notSetUp")}
      </Link>
    );
  if (available.length === 1) return null;
  return (
    <Select value={mode} onValueChange={(v) => setMode(v as AiMode)}>
      <SelectTrigger size="sm" className={cn("h-8 w-auto max-w-48 shrink gap-1.5 text-xs", className)} aria-label={t("mode")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {available.includes("lyze") && (
          <SelectItem value="lyze">
            <SparklesIcon className="text-section-coding" />
            <span>{t("lyze")}</span>
          </SelectItem>
        )}
        {ctx.own && (
          <SelectItem value="own">
            <KeyRoundIcon className="text-section-writeup" />
            <span>{t("own", { provider: providerLabel(ctx.own) })}</span>
          </SelectItem>
        )}
        {ctx.canPlaceholder && (
          <SelectItem value="placeholder">
            <FlaskConicalIcon className="text-section-interviews" />
            <span>{t("placeholder")}</span>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

/** One line on who writes the analysis, following the source picked in the menu. */
export function AiSourceNote({ className }: { className?: string }) {
  const t = useTranslations("writeup");
  const assistant = useAssistant();
  return <p className={className}>{assistant === "builtin" ? t("providerBuiltin") : t("providerClaude", { name: providerLabel(assistant) })}</p>;
}

/** Whether Dev Mode is on, so placeholder-only tools (test data) are offered. */
export function useCanPlaceholder() {
  return !!useContext(Ctx)?.canPlaceholder;
}
