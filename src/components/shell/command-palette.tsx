"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { FolderPlusIcon, MoonIcon, SunIcon, UserIcon } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Swatch } from "@/components/common/swatch";
import { can } from "@/lib/permissions";
import { NAV_ITEMS } from "./nav";
import { useShell } from "./shell-context";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("palette");
  const tn = useTranslations("nav");
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { workspace, workspaces, projects } = useShell();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };
  const go = (href: string) => run(() => router.push(href));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t("title")} description={t("description")}>
      <CommandInput placeholder={t("placeholder")} />
      <CommandList>
        <CommandEmpty>{t("empty")}</CommandEmpty>
        {can(workspace.role, "content:edit") && (
          <CommandGroup heading={t("actions")}>
            <CommandItem onSelect={() => go(`/w/${workspace.slug}/projects?new=1`)}>
              <FolderPlusIcon />
              {t("newProject")}
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading={t("goTo")}>
          {NAV_ITEMS.filter((i) => !i.permission || can(workspace.role, i.permission)).map((item) => (
            <CommandItem key={item.key} value={`nav ${tn(item.key)}`} onSelect={() => go(item.href(workspace.slug))}>
              <item.icon />
              {tn(item.key)}
            </CommandItem>
          ))}
          <CommandItem value={`nav ${t("account")}`} onSelect={() => go("/account")}>
            <UserIcon />
            {t("account")}
          </CommandItem>
        </CommandGroup>
        {projects.length > 0 && (
          <CommandGroup heading={t("projects")}>
            {projects.map((p) => (
              <CommandItem key={p.id} value={`project ${p.name} ${p.id}`} onSelect={() => go(`/w/${workspace.slug}/p/${p.id}`)}>
                <Swatch color={p.color} className="mx-0.5" />
                {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {workspaces.length > 1 && (
          <CommandGroup heading={t("workspaces")}>
            {workspaces
              .filter((w) => w.id !== workspace.id)
              .map((w) => (
                <CommandItem key={w.id} value={`workspace ${w.name} ${w.slug}`} onSelect={() => go(`/w/${w.slug}`)}>
                  <span aria-hidden className="grid size-5 place-items-center rounded bg-accent-soft text-[10px] font-semibold text-accent-soft-foreground">
                    {w.name.charAt(0).toUpperCase()}
                  </span>
                  {w.name}
                </CommandItem>
              ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading={t("preferences")}>
          <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
            {t("toggleTheme")}
            <CommandShortcut>⌘⇧L</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
