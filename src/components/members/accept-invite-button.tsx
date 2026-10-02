"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "@/server/actions/members";
import { useActionFeedback } from "@/components/common/use-action-feedback";

export function AcceptInviteButton({ token }: { token: string }) {
  const t = useTranslations("invite");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button size="lg" className="w-full" disabled={pending} onClick={() => startTransition(async () => void feedback(await acceptInviteAction(token)))}>
      {pending && <Loader2Icon className="animate-spin" />}
      {t("accept")}
    </Button>
  );
}
