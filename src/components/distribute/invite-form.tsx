"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2Icon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { inviteRespondentsAction } from "@/server/actions/forms";

export function InviteForm({ scope, formId }: { scope: { workspaceId: string; slug: string; projectId: string; studyId: string }; formId: string }) {
  const t = useTranslations("distribute");
  const te = useTranslations("errors");
  const tv = useTranslations("validation");
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [skipped, setSkipped] = useState<string[]>([]);

  const submit = () =>
    startTransition(async () => {
      const res = await inviteRespondentsAction(scope, formId, value);
      if (res.ok) {
        toast.success(t("invitesSent", { sent: res.data.sent }));
        setSkipped(res.data.invalid);
        setValue(res.data.invalid.join("\n"));
      } else {
        setSkipped("invalid" in res && Array.isArray(res.invalid) ? res.invalid : []);
        toast.error("invalid" in res && Array.isArray(res.invalid) ? tv("email") : te(res.error));
      }
    });

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="invite-emails">{t("emailsLabel")}</Label>
        <Textarea id="invite-emails" rows={3} placeholder={t("emailsPlaceholder")} value={value} onChange={(e) => setValue(e.target.value)} aria-describedby={skipped.length ? "invite-skipped" : undefined} />
        {skipped.length > 0 && (
          <p id="invite-skipped" className="text-sm text-destructive">
            {t("invalidEmails", { list: skipped.join(", ") })}
          </p>
        )}
      </div>
      <Button type="submit" className="w-fit" disabled={pending || !value.trim()}>
        {pending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        {t("sendInvites")}
      </Button>
    </form>
  );
}
