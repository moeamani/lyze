"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useShell } from "./shell-context";

function WorkspaceMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-sm font-semibold text-accent-soft-foreground",
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || "W"}
    </span>
  );
}

export function WorkspaceSwitcher({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  const t = useTranslations("shell");
  const tr = useTranslations("roles");
  const { workspace, workspaces } = useShell();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-xl p-1.5 text-start transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
          collapsed && "justify-center",
          className,
        )}
        aria-label={t("switchWorkspace")}
      >
        <WorkspaceMark name={workspace.name} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{workspace.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{tr(workspace.role)}</span>
            </span>
            <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("workspaces")}</DropdownMenuLabel>
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} asChild>
            <Link href={`/w/${ws.slug}`}>
              <WorkspaceMark name={ws.name} className="size-6 rounded-md text-xs" />
              <span className="flex-1 truncate">{ws.name}</span>
              {ws.id === workspace.id && <CheckIcon className="size-4 text-primary" />}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding?new=1">
            <PlusIcon />
            {t("newWorkspace")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
