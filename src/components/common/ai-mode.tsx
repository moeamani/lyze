"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { FlaskConicalIcon, SparklesIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AiMode } from "@/server/ai";
import { cn } from "@/lib/utils";

type AiContext = { workspaceId: string; configured: boolean; canPlaceholder: boolean; settingsHref: string };
const Ctx = createContext<AiContext | null>(null);

export function AiModeProvider({ value, children }: { value: AiContext; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const EVENT = "lyze:ai-mode";
const keyFor = (ws: string) => `lyze:ai-mode:${ws}`;
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};
function read(ws: string): AiMode | null {
  try {
    const v = localStorage.getItem(keyFor(ws));
    return v === "ai" || v === "placeholder" ? v : null;
  } catch {
    return null;
  }
}

/**
 * The generation mode for this workspace: "ai" (Claude with the workspace's key) or "placeholder"
 * (the built-in, offline generator). Placeholder exists only for owners and developers; for everyone
 * else the mode is always "ai". The choice is remembered per workspace in this browser.
 */
export function useAiMode(): [AiMode, (m: AiMode) => void, AiContext | null] {
  const ctx = useContext(Ctx);
  const ws = ctx?.workspaceId ?? "";
  const stored = useSyncExternalStore(subscribe, () => read(ws), () => null);
  const fallback: AiMode = ctx && !ctx.configured && ctx.canPlaceholder ? "placeholder" : "ai";
  const mode: AiMode = ctx?.canPlaceholder ? (stored ?? fallback) : "ai";
  const set = useCallback(
    (m: AiMode) => {
      try {
        localStorage.setItem(keyFor(ws), m);
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [ws],
  );
  return [mode, set, ctx];
}

/** "Use AI / Placeholder" next to a generate button. Owners and developers only; others see a set-up hint when AI isn't configured. */
export function AiModeSelect({ className }: { className?: string }) {
  const t = useTranslations("ai");
  const [mode, setMode, ctx] = useAiMode();
  if (!ctx) return null;
  if (!ctx.canPlaceholder)
    return ctx.configured ? null : (
      <Link href={ctx.settingsHref} className={cn("text-xs text-muted-foreground underline-offset-2 hover:underline", className)}>
        {t("notSetUp")}
      </Link>
    );
  return (
    <Select value={mode} onValueChange={(v) => setMode(v as AiMode)}>
      <SelectTrigger size="sm" className={cn("h-8 w-auto gap-1.5 text-xs", className)} aria-label={t("mode")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ai">
          <SparklesIcon className="text-section-coding" />
          {ctx.configured ? t("useAi") : t("useAiNoKey")}
        </SelectItem>
        <SelectItem value="placeholder">
          <FlaskConicalIcon className="text-section-interviews" />
          {t("placeholder")}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Whether the current user may use placeholder-only tools (test data). */
export function useCanPlaceholder() {
  return !!useContext(Ctx)?.canPlaceholder;
}
