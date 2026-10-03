"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookMarkedIcon, FileBarChartIcon, FolderKanbanIcon, GitMergeIcon, HighlighterIcon, LayoutListIcon, NotebookPenIcon, PenLineIcon, QuoteIcon, SearchIcon, type LucideIcon } from "lucide-react";
import { SECTION_BAR, SECTION_TEXT, type Section } from "@/components/common/section-icon";
import { cn } from "@/lib/utils";

type Tab = { href: string; label: string; icon: LucideIcon; active: boolean; section: Section | null };

/**
 * Project navigation, grouped so each part of the work looks different: data (studies), qualitative
 * coding, mixed methods, the write-up, and search. Each group carries its own color.
 */
export function ProjectTabs({ base }: { base: string }) {
  const t = useTranslations("projectTabs");
  const pathname = usePathname();
  const at = (p: string) => pathname.startsWith(`${base}/${p}`);
  const groups: { label: string; tabs: Tab[] }[] = [
    { label: t("groupData"), tabs: [{ href: base, label: t("studies"), icon: LayoutListIcon, active: pathname === base, section: "forms" }] },
    {
      label: t("groupQual"),
      tabs: [
        { href: `${base}/coding`, label: t("coding"), icon: HighlighterIcon, active: at("coding"), section: "coding" },
        { href: `${base}/codebook`, label: t("codebook"), icon: BookMarkedIcon, active: at("codebook"), section: "coding" },
        { href: `${base}/themes`, label: t("themes"), icon: FolderKanbanIcon, active: at("themes"), section: "coding" },
        { href: `${base}/quotes`, label: t("quotes"), icon: QuoteIcon, active: at("quotes"), section: "coding" },
        { href: `${base}/memos`, label: t("memos"), icon: NotebookPenIcon, active: at("memos"), section: "coding" },
      ],
    },
    { label: t("groupMixed"), tabs: [{ href: `${base}/mixed`, label: t("mixed"), icon: GitMergeIcon, active: at("mixed"), section: "mixed" }] },
    {
      label: t("groupWriteup"),
      tabs: [
        { href: `${base}/writeup`, label: t("writeup"), icon: PenLineIcon, active: at("writeup"), section: "writeup" },
        { href: `${base}/reports`, label: t("reports"), icon: FileBarChartIcon, active: at("reports"), section: "writeup" },
      ],
    },
    { label: t("groupFind"), tabs: [{ href: `${base}/search`, label: t("search"), icon: SearchIcon, active: at("search"), section: null }] },
  ];
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex items-center gap-1">
        {groups.map((g, gi) => (
          <li key={g.label} className="flex items-center">
            {gi > 0 && <span aria-hidden className="mx-1.5 h-5 w-px bg-border" />}
            <ul aria-label={g.label} className="flex gap-0.5">
              {g.tabs.map((tab) => (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={tab.active ? "page" : undefined}
                    className={cn(
                      "relative flex h-11 items-center gap-2 rounded-t-md px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
                      tab.active && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full",
                      tab.active && (tab.section ? SECTION_BAR[tab.section] : "after:bg-foreground"),
                    )}
                  >
                    <tab.icon className={cn("size-4", tab.section && SECTION_TEXT[tab.section])} aria-hidden />
                    {tab.label}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
