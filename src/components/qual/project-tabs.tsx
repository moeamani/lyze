"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookMarkedIcon, FolderKanbanIcon, HighlighterIcon, LayoutListIcon, NotebookPenIcon, QuoteIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectTabs({ base }: { base: string }) {
  const t = useTranslations("projectTabs");
  const pathname = usePathname();
  const tabs = [
    { href: base, label: t("studies"), icon: LayoutListIcon, active: pathname === base },
    { href: `${base}/coding`, label: t("coding"), icon: HighlighterIcon, active: pathname.startsWith(`${base}/coding`) },
    { href: `${base}/codebook`, label: t("codebook"), icon: BookMarkedIcon, active: pathname.startsWith(`${base}/codebook`) },
    { href: `${base}/themes`, label: t("themes"), icon: FolderKanbanIcon, active: pathname.startsWith(`${base}/themes`) },
    { href: `${base}/quotes`, label: t("quotes"), icon: QuoteIcon, active: pathname.startsWith(`${base}/quotes`) },
    { href: `${base}/memos`, label: t("memos"), icon: NotebookPenIcon, active: pathname.startsWith(`${base}/memos`) },
    { href: `${base}/search`, label: t("search"), icon: SearchIcon, active: pathname.startsWith(`${base}/search`) },
  ];
  return (
    <nav aria-label={t("label")} className="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1">
        {tabs.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={tab.active ? "page" : undefined}
              className={cn(
                "relative flex h-11 items-center gap-2 rounded-t-lg px-3 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
                tab.active && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary",
              )}
            >
              <tab.icon className="size-4" aria-hidden />
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
