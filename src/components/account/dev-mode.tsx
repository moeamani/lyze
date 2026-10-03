"use client";

import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { setDevModeAction } from "@/server/actions/account";

/** Dev Mode adds Placeholder (the offline generator and test data) to every generate menu. */
export function DevModeToggle({ on }: { on: boolean }) {
  const t = useTranslations("account.devMode");
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useOptimistic(on);
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="grid min-w-0 gap-1">
        <Label htmlFor="dev-mode">{t("label")}</Label>
        <p id="dev-mode-hint" className="text-sm text-pretty text-muted-foreground">
          {t("hint")}
        </p>
      </div>
      <Switch
        id="dev-mode"
        aria-describedby="dev-mode-hint"
        checked={value}
        disabled={pending}
        onCheckedChange={(next) =>
          startTransition(async () => {
            setValue(next);
            await setDevModeAction(next);
          })
        }
      />
    </div>
  );
}
