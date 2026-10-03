"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { createParticipantAction, updateParticipantAction } from "@/server/actions/interviews";
import { PARTICIPANT_STATUSES, type ParticipantStatus } from "@/lib/interviews/participants";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };
export type ParticipantFormValues = {
  name: string;
  email: string;
  phone: string;
  externalId: string;
  notes: string;
  status: ParticipantStatus;
  attributes: { key: string; value: string }[];
};

const EMPTY: ParticipantFormValues = { name: "", email: "", phone: "", externalId: "", notes: "", status: "recruited", attributes: [] };

/** Add or edit one participant. On create, opens their page. */
export function ParticipantDialog({
  scope,
  open,
  onOpenChange,
  participantId,
  initial,
  base,
}: {
  scope: Scope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  participantId?: string;
  initial?: ParticipantFormValues;
  base: string;
}) {
  const t = useTranslations("participants");
  const tc = useTranslations("common");
  const ts = useTranslations("participants.statuses");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<ParticipantFormValues>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof ParticipantFormValues>(k: K, v: ParticipantFormValues[K]) => setValues((prev) => ({ ...prev, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setErrors({ name: t("nameRequired") });
      return;
    }
    const input = {
      name: values.name,
      email: values.email,
      phone: values.phone,
      externalId: values.externalId,
      notes: values.notes,
      status: values.status,
      attributes: Object.fromEntries(values.attributes.filter((a) => a.key.trim() && a.value.trim()).map((a) => [a.key.trim(), a.value.trim()])),
    };
    startTransition(async () => {
      const result = participantId ? await updateParticipantAction(scope, participantId, input) : await createParticipantAction(scope, input);
      if (!result.ok && result.fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(result.fieldErrors).map(([k, v]) => [k, k === "email" ? t("emailInvalid") : v])));
        return;
      }
      if (feedback(result, participantId ? t("updated") : t("created"))) {
        onOpenChange(false);
        if (!participantId) {
          setValues(EMPTY);
          if (result.ok && typeof result.data === "string") router.push(`${base}/participants/${result.data}`);
        }
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{participantId ? t("editTitle") : t("addTitle")}</DialogTitle>
          <DialogDescription>{t("addHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4" noValidate>
          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="p-name">{t("name")}</Label>
            <Input id="p-name" value={values.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} aria-describedby={errors.name ? "p-name-error" : undefined} autoFocus />
            {errors.name && (
              <p id="p-name-error" className="text-sm text-destructive">
                {errors.name}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="p-email">
                {t("email")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
              </Label>
              <Input id="p-email" type="email" inputMode="email" autoComplete="off" value={values.email} onChange={(e) => set("email", e.target.value)} aria-invalid={!!errors.email} />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="p-phone">
                {t("phone")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
              </Label>
              <Input id="p-phone" type="tel" autoComplete="off" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="p-external">
                {t("externalId")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
              </Label>
              <Input id="p-external" value={values.externalId} onChange={(e) => set("externalId", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="p-status">{t("status")}</Label>
              <Select value={values.status} onValueChange={(v) => set("status", v as ParticipantStatus)}>
                <SelectTrigger id="p-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTICIPANT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ts(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <fieldset className="grid grid-cols-1 min-w-0 gap-2">
            <legend className="mb-1 text-sm font-medium">{t("attributes")}</legend>
            <p className="-mt-1 text-xs text-muted-foreground">{t("attributesHint")}</p>
            {values.attributes.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input value={a.key} placeholder={t("attributeKey")} aria-label={t("attributeKeyN", { n: i + 1 })} onChange={(e) => set("attributes", values.attributes.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} />
                <Input value={a.value} placeholder={t("attributeValue")} aria-label={t("attributeValueN", { n: i + 1 })} onChange={(e) => set("attributes", values.attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon-sm" aria-label={t("removeAttribute", { n: i + 1 })} onClick={() => set("attributes", values.attributes.filter((_, j) => j !== i))}>
                  <XIcon />
                </Button>
              </div>
            ))}
            <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => set("attributes", [...values.attributes, { key: "", value: "" }])}>
              <PlusIcon />
              {t("addAttribute")}
            </Button>
          </fieldset>
          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="p-notes">
              {t("notes")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
            </Label>
            <Textarea id="p-notes" rows={3} value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t("notesPlaceholder")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {participantId ? tc("save") : t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddParticipantButton({ scope, base }: { scope: Scope; base: string }) {
  const t = useTranslations("participants");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        {t("add")}
      </Button>
      {open && <ParticipantDialog scope={scope} base={base} open={open} onOpenChange={setOpen} />}
    </>
  );
}
