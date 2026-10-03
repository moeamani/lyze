"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { STUDY_TYPES } from "@/lib/studies";
import { studySchema } from "@/lib/validation";
import { createStudyAction } from "@/server/actions/studies";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { StudyTypeIcon } from "@/components/common/study-type-icon";

type Scope = { workspaceId: string; slug: string; projectId: string };

export function NewStudyButton({ scope, variant = "default" }: { scope: Scope; variant?: "default" | "outline" }) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const tt = useTranslations("studyTypes");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(studySchema),
    defaultValues: { name: "", description: "", type: "survey" as const },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      feedback(await createStudyAction(scope, values));
    }),
  );

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <PlusIcon />
        {t("new")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("close")} className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("newTitle")}</DialogTitle>
            <DialogDescription>{t("newHint")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={onSubmit} className="grid gap-5" noValidate>
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel asChild>
                      <span>{t("typeLabel")}</span>
                    </FormLabel>
                    <RadioGroupPrimitive.Root
                      value={field.value}
                      onValueChange={field.onChange}
                      aria-label={t("typeLabel")}
                      className="grid gap-2 sm:grid-cols-2"
                    >
                      {STUDY_TYPES.map((type) => (
                        <RadioGroupPrimitive.Item
                          key={type}
                          value={type}
                          className="group flex min-h-16 items-start gap-3 rounded-xl border bg-card p-3 text-start transition-[border-color,background-color,transform] outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.99] data-[state=checked]:border-primary/50 data-[state=checked]:bg-accent-soft/60"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground transition-colors group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground">
                            <StudyTypeIcon type={type} className="size-4" />
                          </span>
                          <span className="grid gap-0.5">
                            <span className="text-sm font-medium">{tt(`${type}.name`)}</span>
                            <span className="text-xs text-muted-foreground">{tt(`${type}.hint`)}</span>
                          </span>
                        </RadioGroupPrimitive.Item>
                      ))}
                    </RadioGroupPrimitive.Root>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nameLabel")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("namePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("descriptionLabel")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder={t("descriptionPlaceholder")} {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2Icon className="animate-spin" />}
                  {t("create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
