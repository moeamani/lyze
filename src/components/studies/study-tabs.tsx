"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { BarChart3Icon, LayoutDashboardIcon, PencilRulerIcon, Share2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StudyTabs({ base }: { base: string }) {
  const t = useTranslations("studyTabs");
  const pathname = usePathname();
  const tabs = [
    { href: base, label: t("overview"), icon: LayoutDashboardIcon, active: pathname === base },
    { href: `${base}/build`, label: t("build"), icon: PencilRulerIcon, active: false },
    { href: `${base}/share`, label: t("share"), icon: Share2Icon, active: pathname.startsWith(`${base}/share`) },
    { href: `${base}/responses`, label: t("responses"), icon: BarChart3Icon, active: pathname.startsWith(`${base}/responses`) },
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
