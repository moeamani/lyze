"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { CheckIcon, LanguagesIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/server/actions/auth";
import { setLocaleAction } from "@/server/actions/account";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { cn, initials } from "@/lib/utils";
import { useShell } from "./shell-context";

export function UserAvatar({ className }: { className?: string }) {
  const { user } = useShell();
  return (
    <Avatar className={className}>
      {user.image && <AvatarImage src={user.image} alt="" />}
      <AvatarFallback>{initials(user.name || user.handle)}</AvatarFallback>
    </Avatar>
  );
}

export function UserMenu({ collapsed = false, side = "top" }: { collapsed?: boolean; side?: "top" | "bottom" }) {
  const t = useTranslations("shell");
  const { user } = useShell();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const [, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("account")}
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-xl p-1.5 text-start transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-[3px] focus-visible:ring-ring/40",
          collapsed && "justify-center",
        )}
      >
        <UserAvatar />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name || user.handle.split("@")[0]}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.handle}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{user.handle}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserIcon />
            {t("account")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SunIcon />
            {t("theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
              <DropdownMenuRadioItem value="light">
                <SunIcon /> {t("themeLight")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <MoonIcon /> {t("themeDark")}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <MonitorIcon /> {t("themeSystem")}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LanguagesIcon />
            {t("language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {LOCALES.map((l) => (
              <DropdownMenuItem key={l} onSelect={() => startTransition(() => setLocaleAction(l))} lang={l}>
                <span className="flex-1">{LOCALE_LABELS[l]}</span>
                {l === locale && <CheckIcon className="text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => startTransition(() => signOutAction())}>
          <LogOutIcon />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
