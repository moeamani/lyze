"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup } from "@/components/ui/radio-group";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { PROJECT_COLORS, type ProjectColor } from "@/lib/studies";
import { projectSchema } from "@/lib/validation";
import { createProjectAction, updateProjectAction } from "@/server/actions/projects";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { swatchClass } from "@/components/common/swatch";
import { cn } from "@/lib/utils";

type Scope = { workspaceId: string; slug: string };
type Existing = { id: string; name: string; description: string | null; color: string };

export function ProjectDialog({
  scope,
  project,
  open,
  onOpenChange,
}: {
  scope: Scope;
  project?: Existing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: project?.name ?? "",
      description: project?.description ?? "",
      color: (project?.color as ProjectColor | undefined) ?? "violet",
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (project) {
        if (feedback(await updateProjectAction(scope, project.id, values), t("saved"))) onOpenChange(false);
      } else {
        feedback(await createProjectAction(scope, values));
      }
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc("close")}>
        <DialogHeader>
          <DialogTitle>{project ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("dialogHint")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="grid gap-5" noValidate>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nameLabel")}</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder={t("namePlaceholder")} {...field} />
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
                    <Textarea rows={3} placeholder={t("descriptionPlaceholder")} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel asChild>
                    <span>{t("colorLabel")}</span>
                  </FormLabel>
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="flex flex-wrap gap-2" aria-label={t("colorLabel")}>
                    {PROJECT_COLORS.map((c) => (
                      <RadioGroupPrimitive.Item
                        key={c}
                        value={c}
                        aria-label={t(`colors.${c}`)}
                        className={cn(
                          "grid size-11 place-items-center rounded-xl border-2 border-transparent transition-[border-color,transform] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=checked]:border-foreground/70 active:scale-95",
                        )}
                      >
                        <span className={cn("size-6 rounded-full", swatchClass(c))} />
                      </RadioGroupPrimitive.Item>
                    ))}
                  </RadioGroup>
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {tc("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2Icon className="animate-spin" />}
                {project ? tc("save") : t("create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
