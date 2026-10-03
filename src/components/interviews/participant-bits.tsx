"use client";

import { useTranslations } from "next-intl";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ParticipantStatus } from "@/lib/interviews/participants";
import type { SessionKind, SessionStatus } from "@/lib/interviews/sessions";

const STATUS_VARIANT: Record<ParticipantStatus, "outline" | "soft" | "success" | "destructive" | "secondary"> = {
  recruited: "outline",
  eligible: "soft",
  ineligible: "destructive",
  scheduled: "soft",
  completed: "success",
  withdrawn: "secondary",
};

export function ParticipantStatusBadge({ status }: { status: ParticipantStatus }) {
  const t = useTranslations("participants.statuses");
  return <Badge variant={STATUS_VARIANT[status]}>{t(status)}</Badge>;
}

export function ConsentBadge({ consented, current }: { consented: boolean; current: boolean }) {
  const t = useTranslations("participants");
  if (consented && current)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success">
        <ShieldCheckIcon className="size-3.5" aria-hidden />
        {t("consented")}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ShieldAlertIcon className="size-3.5" aria-hidden />
      {consented ? t("consentOutdated") : t("noConsent")}
    </span>
  );
}

const SESSION_VARIANT: Record<SessionStatus, "outline" | "soft" | "success" | "destructive" | "secondary"> = {
  scheduled: "outline",
  in_progress: "soft",
  completed: "success",
  cancelled: "secondary",
  no_show: "destructive",
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const t = useTranslations("sessions.statuses");
  return <Badge variant={SESSION_VARIANT[status]}>{t(status)}</Badge>;
}

export function SessionKindLabel({ kind }: { kind: SessionKind }) {
  const t = useTranslations("sessions.kinds");
  return <>{t(kind)}</>;
}
