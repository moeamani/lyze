"use client";

import { NotificationBell } from "./notification-bell";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { MenuIcon, SearchIcon } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Logo } from "@/components/common/logo";
import { Swatch } from "@/components/common/swatch";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav";
import { useShell } from "./shell-context";
import { UserAvatar, UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

/** Top bar on phones: workspace + search + account. */
export function MobileHeader() {
  const ts = useTranslations("shell");
  const { workspace, openPalette } = useShell();
  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md md:hidden">
      <Link href={`/w/${workspace.slug}`} aria-label={ts("home")} className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
        <Logo showWord={false} />
      </Link>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{workspace.name}</span>
      <NotificationBell className="size-11 rounded-xl" />
      <button
        type="button"
        onClick={openPalette}
        aria-label={ts("search")}
        className="grid size-11 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <SearchIcon className="size-5" />
      </button>
      <Link href="/account" className="grid size-11 place-items-center rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
        <span aria-hidden>
          <UserAvatar />
        </span>
        <span className="sr-only">{ts("account")}</span>
      </Link>
    </header>
  );
}

/** Bottom tab bar on phones. The last tab opens a sheet with everything else. */
export function MobileTabBar() {
  const t = useTranslations("nav");
  const ts = useTranslations("shell");
  const pathname = usePathname();
  const { workspace, projects } = useShell();
  // The sheet is tied to the path it was opened on, so any navigation closes it.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const moreOpen = openedOn === pathname;
  const setMoreOpen = (open: boolean) => setOpenedOn(open ? pathname : null);

  const primary = NAV_ITEMS.filter((i) => i.key === "home" || i.key === "projects" || i.key === "activity").filter(
    (i) => !i.permission || can(workspace.role, i.permission),
  );
  const secondary = NAV_ITEMS.filter((i) => !primary.includes(i)).filter((i) => !i.permission || can(workspace.role, i.permission));
  const moreActive = secondary.some((i) => isActive(pathname, i.href(workspace.slug), i.exact));

  const tabClass = (active: boolean) =>
    cn(
      "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
      active && "text-primary",
    );

  return (
    <>
      <nav
        aria-label={ts("mainNav")}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      >
        <ul className="flex items-stretch gap-1">
          {primary.map((item) => {
            const href = item.href(workspace.slug);
            const active = isActive(pathname, href, item.exact);
            return (
              <li key={item.key} className="flex flex-1">
                <Link href={href} aria-current={active ? "page" : undefined} className={tabClass(active)}>
                  <item.icon className="size-5" />
                  {t(item.key)}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" onClick={() => setMoreOpen(true)} className={tabClass(moreActive)} aria-haspopup="dialog">
              <MenuIcon className="size-5" />
              {t("more")}
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" closeLabel={ts("close")}>
          <SheetHeader className="pt-0">
            <SheetTitle>
              <Logo />
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
            <WorkspaceSwitcher className="border" />
            <nav aria-label={ts("moreNav")} className="flex flex-col gap-0.5">
              {secondary.map((item) => {
                const href = item.href(workspace.slug);
                const active = isActive(pathname, href, item.exact);
                return (
                  <Link
                    key={item.key}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
                      active && "bg-accent font-medium",
                    )}
                  >
                    <item.icon className="size-5 text-muted-foreground" />
                    {t(item.key)}
                  </Link>
                );
              })}
            </nav>
            {projects.length > 0 && (
              <div className="flex flex-col gap-0.5">
                <span className="px-3 text-xs font-medium text-muted-foreground">{t("recentProjects")}</span>
                {projects.slice(0, 5).map((p) => (
                  <Link
                    key={p.id}
                    href={`/w/${workspace.slug}/p/${p.id}`}
                    className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    <Swatch color={p.color} />
                    <span className="truncate">{p.name}</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="border-t pt-3">
              <UserMenu side="top" />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
