"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { profileSchema } from "@/lib/validation";
import { updateProfileAction } from "@/server/actions/account";
import { useActionFeedback } from "@/components/common/use-action-feedback";

export function ProfileForm({ name }: { name: string }) {
  const t = useTranslations("account");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name } });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      if (feedback(await updateProfileAction(values), t("saved"))) form.reset(values);
    }),
  );

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t("nameLabel")}</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending && <Loader2Icon className="animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </form>
    </Form>
  );
}
