"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { SIDEBAR_COOKIE } from "@/lib/constants";
import { CommandPalette } from "./command-palette";
import { MobileHeader, MobileTabBar } from "./mobile-nav";
import { ShellProvider, type ShellProject, type ShellUser, type ShellWorkspace } from "./shell-context";
import { Sidebar } from "./sidebar";

export function AppShell({
  workspace,
  workspaces,
  user,
  projects,
  defaultCollapsed,
  children,
}: {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  user: ShellUser;
  projects: ShellProject[];
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("shell");
  const { resolvedTheme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Global shortcuts: ⌘/Ctrl+B toggles the sidebar, ⌘/Ctrl+Shift+L toggles the theme.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();
      if (key === "b" && !e.shiftKey) {
        e.preventDefault();
        toggleSidebar();
      } else if (key === "l" && e.shiftKey) {
        e.preventDefault();
        setTheme(resolvedTheme === "dark" ? "light" : "dark");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggleSidebar, resolvedTheme, setTheme]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const value = useMemo(
    () => ({ workspace, workspaces, user, projects, openPalette }),
    [workspace, workspaces, user, projects, openPalette],
  );

  return (
    <ShellProvider value={value}>
      <a
        href="#main"
        className="sr-only z-50 rounded-xl bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t("skipToContent")}
      </a>
      <div className="flex min-h-dvh">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader />
          <main id="main" tabIndex={-1} className="flex-1 pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] outline-none md:pb-0">
            {children}
          </main>
        </div>
      </div>
      <MobileTabBar />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </ShellProvider>
  );
}
