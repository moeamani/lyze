"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DownloadIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { deleteAccountAction } from "@/server/actions/account";

/** Download everything Lyze holds about you, or delete your account. */
export function AccountData({ email }: { email: string }) {
  const t = useTranslations("account.data");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href="/api/account/export" download>
            <DownloadIcon /> {t("export")}
          </a>
        </Button>
        <Button variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
          <Trash2Icon /> {t("delete")}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("close")} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{t("deleteBody")}</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => void feedback(await deleteAccountAction(typed)));
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="confirm-email">{t("typeEmail", { email })}</Label>
              <Input id="confirm-email" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{tc("cancel")}</Button>
              <Button type="submit" variant="destructive" disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}>
                {pending && <Loader2Icon className="animate-spin" />}
                {t("deleteForever")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
