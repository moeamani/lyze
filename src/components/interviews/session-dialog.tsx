"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { SessionKindIcon } from "./kind-icon";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { toLocalInput } from "@/components/common/local-time";
import { createSessionAction, updateSessionAction } from "@/server/actions/interviews";
import { isConversation, maxParticipants, type SessionKind } from "@/lib/interviews/sessions";
import { cn } from "@/lib/utils";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };
export type PersonOption = { id: string; code: string; name: string | null };
export type MemberOption = { id: string; name: string };
export type SessionFormValues = {
  kind: SessionKind;
  title: string;
  scheduledAt: string | null;
  durationMin: number | null;
  location: string;
  interviewerId: string | null;
  participantIds: string[];
};

export function SessionDialog({
  scope,
  base,
  open,
  onOpenChange,
  kinds,
  people,
  members,
  sessionId,
  initial,
}: {
  scope: Scope;
  base: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kinds: SessionKind[];
  people: PersonOption[];
  members: MemberOption[];
  sessionId?: string;
  initial: SessionFormValues;
}) {
  const t = useTranslations("sessions");
  const tk = useTranslations("sessions.kinds");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [v, setV] = useState({ ...initial, when: toLocalInput(initial.scheduledAt), body: "" });
  const set = <K extends keyof typeof v>(k: K, value: (typeof v)[K]) => setV((prev) => ({ ...prev, [k]: value }));
  const limit = maxParticipants(v.kind);
  const written = !isConversation(v.kind);

  const toggle = (id: string) => {
    if (v.participantIds.includes(id)) set("participantIds", v.participantIds.filter((x) => x !== id));
    else if (limit === 1) set("participantIds", [id]);
    else if (v.participantIds.length < limit) set("participantIds", [...v.participantIds, id]);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = {
      kind: v.kind,
      title: v.title.trim() || undefined,
      // datetime-local is the viewer's local time; send an absolute instant.
      scheduledAt: v.when ? new Date(v.when).toISOString() : null,
      durationMin: v.durationMin,
      location: v.location,
      interviewerId: v.interviewerId,
      participantIds: v.participantIds.slice(0, limit),
      ...(written && !sessionId && v.body.trim() ? { body: v.body } : {}),
    };
    startTransition(async () => {
      if (sessionId) {
        if (feedback(await updateSessionAction(scope, sessionId, input), t("updated"))) onOpenChange(false);
        return;
      }
      const result = await createSessionAction(scope, input);
      if (feedback(result, t("created")) && result.ok) {
        onOpenChange(false);
        router.push(`${base}/sessions/${result.data}`);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{sessionId ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>{t("newHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-5" noValidate>
          <div className="grid grid-cols-1 gap-2">
            <Label asChild>
              <span>{t("kind")}</span>
            </Label>
            <RadioGroupPrimitive.Root value={v.kind} onValueChange={(k) => set("kind", k as SessionKind)} aria-label={t("kind")} className="grid grid-cols-2 gap-2">
              {kinds.map((k) => {
                return (
                  <RadioGroupPrimitive.Item
                    key={k}
                    value={k}
                    className="group flex min-h-12 items-center gap-2.5 rounded-xl border bg-card p-2.5 text-start text-sm font-medium outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=checked]:border-primary/50 data-[state=checked]:bg-accent-soft/60"
                  >
                    <span className="grid grid-cols-1 size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground">
                      <SessionKindIcon kind={k} className="size-4" />
                    </span>
                    {tk(k)}
                  </RadioGroupPrimitive.Item>
                );
              })}
            </RadioGroupPrimitive.Root>
          </div>

          <fieldset className="grid grid-cols-1 min-w-0 gap-2">
            <legend className="mb-1 text-sm font-medium">
              {limit === 1 ? t("participant") : t("participantsUpTo", { max: limit })}
            </legend>
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noPeople")}{" "}
                <a href={`${base}/participants`} className="font-medium text-primary hover:underline">
                  {t("addPeople")}
                </a>
              </p>
            ) : (
              <ul className="grid grid-cols-1 max-h-48 gap-1 overflow-y-auto rounded-xl border p-1">
                {people.map((p) => {
                  const checked = v.participantIds.includes(p.id);
                  return (
                    <li key={p.id}>
                      <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm hover:bg-accent/60", checked && "bg-accent-soft/60")}>
                        <input type={limit === 1 ? "radio" : "checkbox"} name="participants" checked={checked} onChange={() => toggle(p.id)} onClick={() => limit === 1 && checked && toggle(p.id)} className="size-4 accent-primary" />
                        <span className="w-10 font-medium tabular-nums">{p.code}</span>
                        <span className="truncate text-muted-foreground">{p.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          {written && !sessionId ? (
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="s-body">
                {v.kind === "diary" ? t("diaryBody") : t("notesBody")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
              </Label>
              <Textarea id="s-body" rows={5} value={v.body} onChange={(e) => set("body", e.target.value)} placeholder={t("bodyPlaceholder")} />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="s-when">
                {written ? t("date") : t("when")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
              </Label>
              <Input id="s-when" type="datetime-local" value={v.when} onChange={(e) => set("when", e.target.value)} />
            </div>
            {!written && (
              <div className="grid grid-cols-1 gap-2">
                <Label htmlFor="s-duration">{t("duration")}</Label>
                <Input id="s-duration" type="number" inputMode="numeric" min={5} max={600} value={v.durationMin ?? ""} onChange={(e) => set("durationMin", e.target.value ? Number(e.target.value) : null)} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="s-location">
                {t("location")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
              </Label>
              <Input id="s-location" value={v.location} onChange={(e) => set("location", e.target.value)} placeholder={t("locationPlaceholder")} />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <Label htmlFor="s-interviewer">{written ? t("author") : t("interviewer")}</Label>
              <Select value={v.interviewerId ?? ""} onValueChange={(id) => set("interviewerId", id)}>
                <SelectTrigger id="s-interviewer" className="w-full">
                  <SelectValue placeholder={t("chooseMember")} />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <Label htmlFor="s-title">
              {t("titleLabel")} <span className="font-normal text-muted-foreground">{tc("optional")}</span>
            </Label>
            <Input id="s-title" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder={t("titlePlaceholder")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />}
              {sessionId ? tc("save") : t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NewSessionButton(props: {
  scope: Scope;
  base: string;
  kinds: SessionKind[];
  people: PersonOption[];
  members: MemberOption[];
  defaultOpen?: boolean;
  defaultParticipant?: string | null;
  currentUserId: string;
}) {
  const t = useTranslations("sessions");
  const [open, setOpen] = useState(!!props.defaultOpen);
  const router = useRouter();
  const initial: SessionFormValues = {
    kind: props.kinds[0]!,
    title: "",
    scheduledAt: null,
    durationMin: 60,
    location: "",
    interviewerId: props.currentUserId,
    participantIds: props.defaultParticipant ? [props.defaultParticipant] : [],
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        {t("new")}
      </Button>
      {open && (
        <SessionDialog
          {...props}
          initial={initial}
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            // Drop ?new=1 so a refresh doesn't reopen the dialog.
            if (!o && props.defaultOpen) router.replace(`${props.base}/sessions`, { scroll: false });
          }}
        />
      )}
    </>
  );
}
