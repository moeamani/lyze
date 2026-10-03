"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { updateWorkspaceSchema } from "@/lib/validation";
import { deleteWorkspaceAction, updateWorkspaceAction } from "@/server/actions/workspaces";

export function WorkspaceSettingsForm({ workspace }: { workspace: { id: string; name: string; slug: string } }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const form = useForm({
    resolver: zodResolver(updateWorkspaceSchema),
    defaultValues: { workspaceId: workspace.id, name: workspace.name, slug: workspace.slug },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await updateWorkspaceAction(values);
      if (!result.ok && result.error === "conflict") {
        form.setError("slug", { message: te("slugTaken") });
        return;
      }
      if (feedback(result, t("saved"))) {
        form.reset(values);
        if (values.slug !== workspace.slug) router.replace(`/w/${values.slug}/settings`);
      }
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
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("slugLabel")}</FormLabel>
              <div className="flex items-center rounded-xl border border-input bg-muted shadow-soft focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25">
                <span className="ps-3.5 pe-1 text-sm text-muted-foreground select-none" dir="ltr">
                  /w/
                </span>
                <FormControl>
                  <Input
                    dir="ltr"
                    autoCapitalize="none"
                    spellCheck={false}
                    className="rounded-s-none border-0 shadow-none focus-visible:ring-0"
                    {...field}
                  />
                </FormControl>
              </div>
              <FormDescription>{t("slugHint")}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            {tc("save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export function DeleteWorkspace({ workspace }: { workspace: { id: string; name: string } }) {
  const t = useTranslations("settings");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        {t("deleteWorkspace")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("deleteTitle", { name: workspace.name })}
        description={t("deleteBody")}
        confirmLabel={t("deleteConfirm")}
        onConfirm={async () => feedback(await deleteWorkspaceAction(workspace.id))}
      />
    </>
  );
}
