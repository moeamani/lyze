"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Loader2Icon, LogOutIcon, UserMinusIcon, UserPlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { ROLES, type Role } from "@/lib/permissions";
import { inviteSchema } from "@/lib/validation";
import {
  changeRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
} from "@/server/actions/members";

type Scope = { workspaceId: string; slug: string };

export function InviteDialog({ scope }: { scope: Scope }) {
  const t = useTranslations("members");
  const tc = useTranslations("common");
  const tr = useTranslations("roles");
  const te = useTranslations("errors");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm({ resolver: zodResolver(inviteSchema), defaultValues: { email: "", role: "editor" as const } });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await inviteMemberAction(scope, values);
      if (!result.ok && result.error === "conflict") {
        form.setError("email", { message: te("alreadyMember") });
        return;
      }
      if (feedback(result, t("invited", { email: values.email }))) {
        form.reset();
        setOpen(false);
      }
    }),
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlusIcon />
        {t("invite")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={tc("close")}>
          <DialogHeader>
            <DialogTitle>{t("inviteTitle")}</DialogTitle>
            <DialogDescription>{t("inviteHint")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={onSubmit} className="grid gap-5" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("emailLabel")}</FormLabel>
                    <FormControl>
                      <Input type="email" inputMode="email" autoComplete="off" autoFocus placeholder="name@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("roleLabel")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLES.filter((r) => r !== "owner").map((r) => (
                          <SelectItem key={r} value={r}>
                            {tr(r)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">{t(`roleHints.${field.value}`)}</p>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  {tc("cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2Icon className="animate-spin" />}
                  {t("sendInvite")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RoleSelect({ scope, userId, role, label }: { scope: Scope; userId: string; role: Role; label: string }) {
  const tr = useTranslations("roles");
  const t = useTranslations("members");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(async () => {
          feedback(await changeRoleAction(scope, userId, next as Role), t("roleChanged"));
        })
      }
    >
      <SelectTrigger size="sm" className="w-32" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {tr(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RemoveMemberButton({ scope, userId, name }: { scope: Scope; userId: string; name: string }) {
  const t = useTranslations("members");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={t("removeLabel", { name })} onClick={() => setOpen(true)}>
        <UserMinusIcon />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("removeTitle", { name })}
        description={t("removeBody")}
        confirmLabel={t("removeConfirm")}
        onConfirm={async () => feedback(await removeMemberAction(scope, userId), t("removed"))}
      />
    </>
  );
}

export function RevokeInviteButton({ scope, inviteId, email }: { scope: Scope; inviteId: string; email: string }) {
  const t = useTranslations("members");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={t("revokeLabel", { email })}
      onClick={() => startTransition(async () => void feedback(await revokeInviteAction(scope, inviteId), t("revoked")))}
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <XIcon />}
    </Button>
  );
}

export function LeaveWorkspace({ scope, userId, workspaceName }: { scope: Scope; userId: string; workspaceName: string }) {
  const t = useTranslations("members");
  const feedback = useActionFeedback();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <LogOutIcon />
        {t("leave")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("leaveTitle", { name: workspaceName })}
        description={t("leaveBody")}
        confirmLabel={t("leaveConfirm")}
        onConfirm={async () => feedback(await removeMemberAction(scope, userId))}
      />
    </>
  );
}
