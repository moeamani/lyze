"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { STUDY_STATUSES, type StudyStatus } from "@/lib/studies";
import { studyUpdateSchema } from "@/lib/validation";
import { deleteStudyAction, updateStudyAction } from "@/server/actions/studies";

type Scope = { workspaceId: string; slug: string; projectId: string };

export function StudySettings({
  scope,
  study,
  canEdit,
}: {
  scope: Scope;
  study: { id: string; name: string; description: string | null; status: StudyStatus };
  canEdit: boolean;
}) {
  const t = useTranslations("studies");
  const tc = useTranslations("common");
  const ts = useTranslations("studyStatus");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const form = useForm({
    resolver: zodResolver(studyUpdateSchema),
    defaultValues: { name: study.name, description: study.description ?? "", status: study.status },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (feedback(await updateStudyAction(scope, study.id, values), t("saved"))) form.reset(values);
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-5" noValidate>
        <fieldset disabled={!canEdit} className="grid gap-5">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("nameLabel")}</FormLabel>
                <FormControl>
                  <Input {...field} />
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
                <FormLabel>{t("descriptionLabel")}</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("statusLabel")}</FormLabel>
                <Select value={field.value} onValueChange={field.onChange} disabled={!canEdit}>
                  <FormControl>
                    <SelectTrigger className="w-full sm:w-56">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {STUDY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ts(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{t(`statusHint.${field.value}`)}</FormDescription>
              </FormItem>
            )}
          />
        </fieldset>
        {canEdit && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button type="button" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirming(true)}>
              <Trash2Icon />
              {t("delete")}
            </Button>
            <Button type="submit" disabled={pending || !form.formState.isDirty}>
              {pending && <Loader2Icon className="animate-spin" />}
              {tc("save")}
            </Button>
          </div>
        )}
      </form>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("deleteTitle", { name: study.name })}
        description={t("deleteBody")}
        confirmLabel={t("deleteConfirm")}
        onConfirm={async () => feedback(await deleteStudyAction(scope, study.id))}
      />
    </Form>
  );
}
