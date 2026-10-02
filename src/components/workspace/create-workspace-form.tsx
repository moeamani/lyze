"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { createWorkspaceSchema } from "@/lib/validation";
import { createWorkspaceAction } from "@/server/actions/workspaces";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { cn } from "@/lib/utils";

export function CreateWorkspaceForm({ suggestedName, offerDemo }: { suggestedName: string; offerDemo: boolean }) {
  const t = useTranslations("onboarding");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: suggestedName, withDemo: offerDemo },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      feedback(await createWorkspaceAction(values));
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nameLabel")}</FormLabel>
              <FormControl>
                <Input autoFocus autoComplete="organization" placeholder={t("namePlaceholder")} {...field} />
              </FormControl>
              <FormDescription>{t("nameHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {offerDemo && (
          <FormField
            control={form.control}
            name="withDemo"
            render={({ field }) => (
              <FormItem>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40",
                    field.value && "border-primary/40 bg-accent-soft/50",
                  )}
                >
                  <FormControl>
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--primary)]"
                      checked={!!field.value}
                      onChange={(e) => field.onChange(e.target.checked)}
                    />
                  </FormControl>
                  <span className="grid gap-0.5">
                    <span className="flex items-center gap-1.5 text-sm font-medium">
                      <SparklesIcon className="size-4 text-primary" aria-hidden />
                      {t("demoLabel")}
                    </span>
                    <span className="text-sm text-muted-foreground">{t("demoHint")}</span>
                  </span>
                </label>
              </FormItem>
            )}
          />
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <Loader2Icon className="animate-spin" />}
          {t("create")}
        </Button>
      </form>
    </Form>
  );
}
