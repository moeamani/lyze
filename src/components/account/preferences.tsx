"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LOCALES, LOCALE_LABELS } from "@/i18n/config";
import { setLocaleAction } from "@/server/actions/account";

export function Preferences() {
  const t = useTranslations("account");
  const ts = useTranslations("shell");
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="text-sm font-medium" id="theme-label">
          {ts("theme")}
        </span>
        <Tabs value={theme ?? "system"} onValueChange={setTheme}>
          <TabsList aria-labelledby="theme-label" className="w-full sm:w-fit">
            <TabsTrigger value="light">
              <SunIcon className="size-4" /> {ts("themeLight")}
            </TabsTrigger>
            <TabsTrigger value="dark">
              <MoonIcon className="size-4" /> {ts("themeDark")}
            </TabsTrigger>
            <TabsTrigger value="system">
              <MonitorIcon className="size-4" /> {ts("themeSystem")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="locale">{t("language")}</Label>
        <Select value={locale} disabled={pending} onValueChange={(v) => startTransition(() => setLocaleAction(v))}>
          <SelectTrigger id="locale" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCALES.map((l) => (
              <SelectItem key={l} value={l} lang={l}>
                {LOCALE_LABELS[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
