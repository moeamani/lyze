"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { DownloadIcon, FilterIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConditionGroupEditor, defaultValue, operatorsFor } from "@/components/builder/logic-editor";
import type { ConditionGroup, FormDoc, Question } from "@/lib/forms/schema";

export function encodeFilter(f: ConditionGroup | null) {
  return f && f.conditions.length ? JSON.stringify(f) : null;
}

/** Shared filter + compare-by + export row. State lives in the URL so views are shareable. */
export function ResultsToolbar({
  doc,
  filter,
  compareOptions,
  by,
  studyId,
  showCompare = true,
}: {
  doc: Pick<FormDoc, "pages">;
  filter: ConditionGroup | null;
  compareOptions: { id: string; label: string }[];
  by: string | null;
  studyId: string;
  showCompare?: boolean;
}) {
  const t = useTranslations("results");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const questions: Question[] = doc.pages.flatMap((p) => p.questions);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ConditionGroup>(filter ?? emptyGroup(questions));

  const query = params.toString();
  const pending = useRef<string | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [query]);

  const navigate = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(pending.current ?? query);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    pending.current = next.toString();
    router.push(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };

  const formats = [
    { key: "xlsx", label: t("formats.xlsx") },
    { key: "csv", label: t("formats.csv") },
    { key: "csv-codes", label: t("formats.csvCodes") },
    { key: "sav", label: t("formats.sav") },
    { key: "r", label: t("formats.r") },
    { key: "qdpx", label: t("formats.qdpx") },
    { key: "qdpx-maxqda", label: t("formats.qdpxMaxqda") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={filter ? "soft" : "outline"}
        size="sm"
        onClick={() => {
          setDraft(filter ?? emptyGroup(questions));
          setOpen(true);
        }}
        disabled={questions.length === 0}
      >
        <FilterIcon />
        {filter ? t("filtered", { count: filter.conditions.length }) : t("addFilter")}
      </Button>
      {filter && (
        <Button variant="ghost" size="sm" onClick={() => navigate({ f: null })} aria-label={t("clearFilter")}>
          <XIcon />
          {t("clearFilter")}
        </Button>
      )}

      {showCompare && compareOptions.length > 0 && (
        <Select value={by ?? "none"} onValueChange={(v) => navigate({ by: v === "none" ? null : v })}>
          <SelectTrigger size="sm" className="w-auto max-w-64" aria-label={t("compareBy")}>
            <span className="text-muted-foreground">{t("compareBy")}:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("noCompare")}</SelectItem>
            {compareOptions.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                <span className="truncate">{o.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="ms-auto">
            <DownloadIcon />
            {t("export")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>{t("exportHint")}</DropdownMenuLabel>
          {formats.map((f, i) => (
            <div key={f.key}>
              {(i === 3 || i === 5) && <DropdownMenuSeparator />}
              <DropdownMenuItem asChild>
                <a href={`/api/studies/${studyId}/export?format=${f.key}`} download>
                  {f.label}
                </a>
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("close")} className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("filterTitle")}</DialogTitle>
            <DialogDescription>{t("filterHint")}</DialogDescription>
          </DialogHeader>
          <ConditionGroupEditor doc={doc} group={draft} onChange={setDraft} eligible={questions} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tc("cancel")}
            </Button>
            <Button
              disabled={draft.conditions.some((c) => !c.questionId)}
              onClick={() => {
                setOpen(false);
                navigate({ f: encodeFilter(draft) });
              }}
            >
              {t("applyFilter")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function emptyGroup(questions: Question[]): ConditionGroup {
  const q = questions[0];
  return { match: "all", conditions: [{ questionId: q?.id ?? "", operator: operatorsFor(q)[0]!, value: defaultValue(q) }] };
}
