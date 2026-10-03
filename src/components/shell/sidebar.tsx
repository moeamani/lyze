"use client";

import { NotificationBell } from "./notification-bell";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon, SearchIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "@/components/common/logo";
import { Swatch } from "@/components/common/swatch";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActive } from "./nav";
import { useShell } from "./shell-context";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { Kbd } from "./kbd";

function NavLink({
  href,
  active,
  collapsed,
  label,
  children,
}: {
  href: string;
  active: boolean;
  collapsed: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const link = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
        active && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {children}
      <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const t = useTranslations("nav");
  const ts = useTranslations("shell");
  const pathname = usePathname();
  const { workspace, projects, openPalette } = useShell();

  return (
    <aside
      aria-label={ts("sidebar")}
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col gap-2 border-e bg-sidebar p-3 transition-[width] duration-200 md:flex",
        collapsed ? "w-(--sidebar-width-collapsed)" : "w-(--sidebar-width)",
      )}
    >
      <div className={cn("flex h-10 items-center", collapsed ? "justify-center" : "justify-between ps-1.5")}>
        {!collapsed && (
          <Link href={`/w/${workspace.slug}`} className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
            <Logo />
          </Link>
        )}
        <div className={cn("flex items-center", collapsed && "flex-col")}>
        {!collapsed && <NotificationBell />}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggle}
              aria-label={collapsed ? ts("expandSidebar") : ts("collapseSidebar")}
              aria-expanded={!collapsed}
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              {collapsed ? <PanelLeftOpenIcon className="size-4 rtl:-scale-x-100" /> : <PanelLeftCloseIcon className="size-4 rtl:-scale-x-100" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? ts("expandSidebar") : ts("collapseSidebar")} <Kbd className="ms-1">⌘B</Kbd>
          </TooltipContent>
        </Tooltip>
        </div>
      </div>

      <WorkspaceSwitcher collapsed={collapsed} />

      <button
        type="button"
        onClick={openPalette}
        className={cn(
          "flex h-10 items-center gap-3 rounded-xl border bg-card px-3 text-sm text-muted-foreground shadow-soft transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40",
          collapsed && "justify-center px-0",
        )}
        aria-label={ts("search")}
      >
        <SearchIcon className="size-4" />
        {!collapsed && (
          <>
            <span className="flex-1 text-start">{ts("search")}</span>
            <Kbd>⌘K</Kbd>
          </>
        )}
      </button>

      <nav aria-label={ts("mainNav")} className="mt-2 flex flex-col gap-0.5">
        {NAV_ITEMS.filter((item) => !item.permission || can(workspace.role, item.permission)).map((item) => {
          const href = item.href(workspace.slug);
          return (
            <NavLink key={item.key} href={href} active={isActive(pathname, href, item.exact)} collapsed={collapsed} label={t(item.key)}>
              <item.icon className="size-4 shrink-0" />
            </NavLink>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-xs font-medium text-muted-foreground">{t("recentProjects")}</span>
            {can(workspace.role, "content:edit") && (
              <Link
                href={`/w/${workspace.slug}/projects?new=1`}
                aria-label={ts("newProject")}
                className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <PlusIcon className="size-3.5" />
              </Link>
            )}
          </div>
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
            {projects.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">{t("noProjects")}</p>
            ) : (
              projects.map((p) => {
                const href = `/w/${workspace.slug}/p/${p.id}`;
                return (
                  <NavLink key={p.id} href={href} active={isActive(pathname, href)} collapsed={false} label={p.name}>
                    <Swatch color={p.color} />
                  </NavLink>
                );
              })
            )}
          </div>
        </div>
      )}
      {collapsed && <div className="flex-1" />}

      <UserMenu collapsed={collapsed} />
    </aside>
  );
}
