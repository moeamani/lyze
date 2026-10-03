"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EyeOffIcon, Loader2Icon, MailIcon, MoreHorizontalIcon, PencilIcon, ShieldCheckIcon, ShieldOffIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { useActionFeedback } from "@/components/common/use-action-feedback";
import { CopyField } from "@/components/distribute/copy-field";
import {
  anonymizeParticipantAction,
  deleteParticipantAction,
  recordConsentAction,
  revokeConsentAction,
  sendConsentLinkAction,
  setParticipantStatusAction,
} from "@/server/actions/interviews";
import { PARTICIPANT_STATUSES, type ParticipantStatus } from "@/lib/interviews/participants";
import { ParticipantDialog, type ParticipantFormValues } from "./participant-dialog";
import { LocalTime } from "@/components/common/local-time";

type Scope = { workspaceId: string; slug: string; projectId: string; studyId: string };

export function ParticipantActions({
  scope,
  base,
  participantId,
  code,
  status,
  values,
  anonymized,
}: {
  scope: Scope;
  base: string;
  participantId: string;
  code: string;
  status: ParticipantStatus;
  values: ParticipantFormValues;
  anonymized: boolean;
}) {
  const t = useTranslations("participants");
  const ts = useTranslations("participants.statuses");
  const feedback = useActionFeedback();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"anonymize" | "delete" | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={status}
        disabled={pending}
        onValueChange={(v) => startTransition(async () => void feedback(await setParticipantStatusAction(scope, participantId, v as ParticipantStatus)))}
      >
        <SelectTrigger className="w-44" aria-label={t("status")}>
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
      {!anonymized && (
        <Button variant="outline" onClick={() => setEditing(true)}>
          <PencilIcon />
          {t("edit")}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("moreActions")}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!anonymized && (
            <DropdownMenuItem onSelect={() => setConfirm("anonymize")}>
              <EyeOffIcon />
              {t("anonymize")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
            <Trash2Icon />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && <ParticipantDialog scope={scope} base={base} open={editing} onOpenChange={setEditing} participantId={participantId} initial={values} />}
      <ConfirmDialog
        open={confirm === "anonymize"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("anonymizeTitle", { code })}
        description={t("anonymizeBody")}
        confirmLabel={t("anonymize")}
        onConfirm={async () => feedback(await anonymizeParticipantAction(scope, participantId), t("anonymizedToast"))}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t("deleteTitle", { code })}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (feedback(await deleteParticipantAction(scope, participantId), t("deleted"))) router.push(`${base}/participants`);
        }}
      />
    </div>
  );
}

export function ConsentPanel({
  scope,
  base,
  participantId,
  link,
  hasEmail,
  hasForm,
  consent,
  canEdit,
}: {
  scope: Scope;
  base: string;
  participantId: string;
  link: string;
  hasEmail: boolean;
  hasForm: boolean;
  consent: { at: string; method: "online" | "written" | "verbal"; name: string | null; version: number | null; current: boolean; sentAt: string | null } | { at: null; sentAt: string | null };
  canEdit: boolean;
}) {
  const t = useTranslations("participants.consentPanel");
  const feedback = useActionFeedback();
  const [pending, startTransition] = useTransition();
  const [method, setMethod] = useState<"verbal" | "written">("verbal");
  const [revoking, setRevoking] = useState(false);

  if (!hasForm) {
    return (
      <div className="grid grid-cols-1 gap-3 text-sm">
        <p className="text-muted-foreground">{t("noForm")}</p>
        {canEdit && (
          <Button asChild variant="outline" className="w-fit">
            <a href={`${base}/guide?tab=consent`}>{t("createForm")}</a>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 text-sm">
      {consent.at ? (
        <div className="grid grid-cols-1 gap-1 rounded-xl bg-success/10 p-3">
          <p className="flex items-center gap-2 font-medium text-success">
            <ShieldCheckIcon className="size-4" aria-hidden />
            {t(`signed_${consent.method}`)}
          </p>
          <p className="text-muted-foreground">
            <LocalTime date={consent.at} /> · {t("version", { version: consent.version ?? 1 })}
            {consent.name ? ` · ${consent.name}` : ""}
          </p>
          {!consent.current && <p className="text-foreground">⚠︎ {t("outdated")}</p>}
        </div>
      ) : (
        <p className="text-muted-foreground">{t("notYet")}</p>
      )}

      {canEdit && (
        <>
          <div className="grid grid-cols-1 gap-2">
            <Label>{t("link")}</Label>
            <CopyField value={link} label={t("link")} />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasEmail || pending}
                onClick={() => startTransition(async () => void feedback(await sendConsentLinkAction(scope, participantId), t("sent")))}
              >
                {pending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
                {t("send")}
              </Button>
              {!hasEmail && <span className="text-xs text-muted-foreground">{t("noEmail")}</span>}
              {consent.sentAt && (
                <span className="text-xs text-muted-foreground">
                  {t("sentAt")} <LocalTime date={consent.sentAt} preset="date" />
                </span>
              )}
            </div>
          </div>
          <form
            className="grid grid-cols-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = new FormData(e.currentTarget).get("signer");
              startTransition(async () => void feedback(await recordConsentAction(scope, participantId, { method, name: typeof name === "string" ? name : null }), t("recorded")));
            }}
          >
            <Label htmlFor="consent-method">{t("record")}</Label>
            <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2">
              <Select value={method} onValueChange={(v) => setMethod(v as "verbal" | "written")}>
                <SelectTrigger id="consent-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="verbal">{t("verbal")}</SelectItem>
                  <SelectItem value="written">{t("written")}</SelectItem>
                </SelectContent>
              </Select>
              <Input name="signer" placeholder={t("signerPlaceholder")} aria-label={t("signer")} />
              <Button type="submit" variant="secondary" disabled={pending} className="col-span-2 w-fit">
                {t("recordButton")}
              </Button>
            </div>
          </form>
          {consent.at && (
            <>
              <Button variant="ghost" size="sm" className="w-fit text-destructive" onClick={() => setRevoking(true)}>
                <ShieldOffIcon />
                {t("revoke")}
              </Button>
              <ConfirmDialog
                open={revoking}
                onOpenChange={setRevoking}
                title={t("revokeTitle")}
                description={t("revokeBody")}
                confirmLabel={t("revoke")}
                onConfirm={async () => feedback(await revokeConsentAction(scope, participantId), t("revoked"))}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
