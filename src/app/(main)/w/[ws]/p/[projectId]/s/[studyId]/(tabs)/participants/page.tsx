import { CreatePanel } from "@/components/common/create-options";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSessionStudyContext } from "@/server/queries/workspace";
import { listParticipants } from "@/server/services/participants";
import { getGuide } from "@/server/services/guides";
import { can } from "@/lib/permissions";
import { EmptyState } from "@/components/common/empty-state";
import { PeopleIllustration } from "@/components/illustrations";
import { AddParticipantButton } from "@/components/interviews/participant-dialog";
import { ImportParticipantsButton } from "@/components/interviews/import-participants";
import { ParticipantsList } from "@/components/interviews/participants-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("participants");
  return { title: t("title") };
}

export default async function ParticipantsPage({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/participants">) {
  const { ws, projectId, studyId } = await params;
  const { workspace, role, study, scope, base } = await getSessionStudyContext(ws, projectId, studyId);
  const t = await getTranslations("participants");
  const [rows, guide] = await Promise.all([listParticipants(workspace.id, study.id), getGuide(workspace.id, study.id)]);
  const canEdit = can(role, "content:edit");
  const consentVersion = guide.consent?.version ?? null;

  const actions = canEdit && (
    <div className="flex flex-wrap gap-2">
      <ImportParticipantsButton scope={scope} />
      <AddParticipantButton scope={scope} base={base} />
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <EmptyState illustration={<PeopleIllustration />} title={t("emptyTitle")} description={t("emptyBody")}>
          {actions}
        </EmptyState>
        {canEdit && <CreatePanel scope={scope} kind="participants" />}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
        {actions}
      </div>
      {canEdit && <CreatePanel scope={scope} kind="participants" />}
      <ParticipantsList
        base={base}
        rows={rows.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          email: canEdit ? p.email : null,
          status: p.status,
          attributes: p.attributes,
          consented: !!p.consentAt,
          consentCurrent: !!p.consentAt && (consentVersion === null || p.consentVersion === consentVersion),
          sessionCount: p.sessionCount,
          lastSessionAt: p.lastSessionAt ? new Date(p.lastSessionAt).toISOString() : null,
          anonymized: !!p.anonymizedAt,
        }))}
      />
    </div>
  );
}
