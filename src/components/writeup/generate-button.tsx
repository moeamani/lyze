"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { AiModeSelect, useAiMode } from "@/components/common/ai-mode";
import { generateWriteupAction } from "@/server/actions/writeup";

export function GenerateButton({ scope, base }: { scope: { workspaceId: string; slug: string; projectId: string }; base: string }) {
  const t = useTranslations("writeup");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode] = useAiMode();
  return (
    <div className="flex flex-wrap items-center gap-2">
    <AiModeSelect />
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await generateWriteupAction(scope, mode);
          if (feedback(result, t("generated")) && result.ok) router.push(`${base}/${result.data}`);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
      {pending ? t("writing") : t("generate")}
    </Button>
    </div>
  );
}
