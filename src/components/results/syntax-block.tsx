"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CodeIcon, CopyIcon } from "lucide-react";
import type { Syntax } from "@/lib/analysis/syntax";
import { cn } from "@/lib/utils";

/** Collapsible R / SPSS syntax that reproduces a result from the exported data. */
export function SyntaxBlock({ syntax, defaultOpen = false }: { syntax: Syntax; defaultOpen?: boolean }) {
  const t = useTranslations("results");
  const [open, setOpen] = useState(defaultOpen);
  const [lang, setLang] = useState<"r" | "spss">("r");
  const [copied, setCopied] = useState(false);
  const code = syntax[lang];
  return (
    <div className="rounded-xl border bg-muted/30">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-start text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <CodeIcon className="size-4" aria-hidden />
        {t("reproduce")}
      </button>
      {open && (
        <div className="grid gap-2 border-t p-3">
          <div className="flex items-center justify-between gap-2">
            <div role="radiogroup" aria-label={t("reproduce")} className="inline-flex h-8 rounded-lg bg-muted p-0.5 text-xs">
              {(["r", "spss"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={lang === l}
                  onClick={() => setLang(l)}
                  className={cn("rounded-md px-3 font-medium text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40", lang === l && "bg-card text-foreground shadow-soft")}
                >
                  {l === "r" ? "R" : "SPSS"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard?.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              {copied ? <CheckIcon className="size-3.5" aria-hidden /> : <CopyIcon className="size-3.5" aria-hidden />}
              <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
            </button>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-card p-3 font-mono text-xs leading-relaxed" dir="ltr">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
