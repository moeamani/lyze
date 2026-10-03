"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { setResponseExcludedAction } from "@/server/actions/analysis";

export function ExcludeResponseButton({ scope, responseId, excluded }: { scope: { workspaceId: string; slug: string; projectId: string; studyId: string }; responseId: string; excluded: boolean }) {
  const t = useTranslations("responses");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      aria-pressed={excluded}
      onClick={() => startTransition(async () => void feedback(await setResponseExcludedAction(scope, responseId, !excluded), excluded ? t("includedToast") : t("excludedToast")))}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : excluded ? <EyeIcon /> : <EyeOffIcon />}
      {excluded ? t("include") : t("exclude")}
    </Button>
  );
}
