"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FilePlusIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { createReportAction, generateReportAction } from "@/server/actions/reports";

export function ReportListActions({ scope, base }: { scope: { workspaceId: string; slug: string; projectId: string }; base: string }) {
  const t = useTranslations("reportBuilder");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const go = (fn: () => ReturnType<typeof generateReportAction>, msg: string) =>
    startTransition(async () => {
      const r = await fn();
      if (feedback(r, msg) && r.ok) router.push(`${base}/${r.data}`);
    });
  return (
    <>
      <Button disabled={pending} onClick={() => go(() => generateReportAction(scope), t("generatedReport"))}>
        {pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
        {t("generate")}
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => go(() => createReportAction(scope, t("untitled")), t("created"))}>
        <FilePlusIcon /> {t("blank")}
      </Button>
    </>
  );
}
