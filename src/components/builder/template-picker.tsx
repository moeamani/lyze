"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardListIcon, CoffeeIcon, FilePlus2Icon, FilterIcon, GraduationCapIcon, Loader2Icon, MessageSquareHeartIcon, MousePointerClickIcon } from "lucide-react";
import { createFormAction } from "@/server/actions/forms";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import type { TemplateKey } from "@/lib/forms/templates";
import { cn } from "@/lib/utils";

const OPTIONS: { key: TemplateKey | "blank"; icon: typeof ClipboardListIcon }[] = [
  { key: "blank", icon: FilePlus2Icon },
  { key: "customerFeedback", icon: MessageSquareHeartIcon },
  { key: "usabilityTest", icon: MousePointerClickIcon },
  { key: "academicSurvey", icon: GraduationCapIcon },
  { key: "screener", icon: FilterIcon },
  { key: "coffee", icon: CoffeeIcon },
];

export function TemplatePicker({ scope }: { scope: { workspaceId: string; slug: string; projectId: string; studyId: string } }) {
  const t = useTranslations("builder");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);

  const pick = (key: TemplateKey | "blank") => {
    setChosen(key);
    startTransition(async () => {
      if (feedback(await createFormAction(scope, key))) router.refresh();
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 md:py-12">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold">{t("templatesTitle")}</h1>
        <p className="text-muted-foreground">{t("templatesHint")}</p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OPTIONS.map(({ key, icon: Icon }) => (
          <li key={key}>
            <button
              type="button"
              disabled={pending}
              onClick={() => pick(key)}
              className={cn(
                "group flex h-full w-full flex-col items-start gap-3 rounded-2xl border bg-card p-5 text-start shadow-soft transition-[box-shadow,transform,border-color] outline-none hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60 motion-reduce:hover:translate-y-0",
                key === "blank" && "border-dashed",
              )}
            >
              <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent-soft-foreground">
                {pending && chosen === key ? <Loader2Icon className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
              </span>
              <span>
                <span className="block font-semibold">{t(`templates.${key}.name`)}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{t(`templates.${key}.description`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
