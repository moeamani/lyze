"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { updateSpeakersAction } from "@/server/actions/interviews";
import { SPEAKER_ROLES, type SpeakerRole, type Speakers } from "@/lib/interviews/sessions";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };

/** Name speakers, set who is who, and link voices to participants (shown by their code). */
export function SpeakersDialog({
  scope,
  sessionId,
  speakers,
  participants,
  open,
  onOpenChange,
}: {
  scope: Scope;
  sessionId: string;
  speakers: Speakers;
  participants: { id: string; code: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("sessionPage.speakers");
  const tc = useTranslations("common");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const keys = Object.keys(speakers).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const [draft, setDraft] = useState(speakers);
  const set = (k: string, patch: Partial<Speakers[string]>) => setDraft((d) => ({ ...d, [k]: { ...d[k]!, ...patch } }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={tc("close")} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-1 gap-4">
          {keys.map((k, i) => {
            const s = draft[k]!;
            return (
              <li key={k} className="grid grid-cols-1 gap-2 rounded-xl border p-3">
                <p className="text-xs font-medium text-muted-foreground">{t("voice", { n: i + 1 })}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Select
                    value={s.participantId ?? "none"}
                    onValueChange={(v) => {
                      const p = participants.find((x) => x.id === v);
                      set(k, p ? { participantId: p.id, name: p.code, role: "participant" } : { participantId: null });
                    }}
                  >
                    <SelectTrigger className="w-full" aria-label={t("linkTo", { n: i + 1 })}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("notLinked")}</SelectItem>
                      {participants.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={s.role} onValueChange={(v) => set(k, { role: v as SpeakerRole })} disabled={!!s.participantId}>
                    <SelectTrigger className="w-full" aria-label={t("roleOf", { n: i + 1 })}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SPEAKER_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`role_${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!s.participantId && <Input value={s.name} onChange={(e) => set(k, { name: e.target.value })} aria-label={t("nameOf", { n: i + 1 })} maxLength={80} />}
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button
            disabled={pending || keys.some((k) => !draft[k]!.name.trim())}
            onClick={() =>
              startTransition(async () => {
                if (feedback(await updateSpeakersAction(scope, sessionId, draft), t("saved"))) onOpenChange(false);
              })
            }
          >
            {pending && <Loader2Icon className="animate-spin" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
