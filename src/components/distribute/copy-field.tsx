"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyField({ value, label, multiline = false }: { value: string; label: string; multiline?: boolean }) {
  const t = useTranslations("distribute");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className={cn("flex gap-2", multiline && "flex-col")}>
      {multiline ? (
        <textarea readOnly aria-label={label} value={value} rows={4} onFocus={(e) => e.target.select()} className="w-full resize-none rounded-xl border bg-muted px-3 py-2 font-mono text-xs" dir="ltr" />
      ) : (
        <input readOnly aria-label={label} value={value} onFocus={(e) => e.target.select()} className="h-10 min-w-0 flex-1 rounded-xl border bg-muted px-3 text-sm" dir="ltr" />
      )}
      <Button type="button" variant="outline" onClick={copy} className={cn(multiline && "w-fit")}>
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
      </Button>
    </div>
  );
}
