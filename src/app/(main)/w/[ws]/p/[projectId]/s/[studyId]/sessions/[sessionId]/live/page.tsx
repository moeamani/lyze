import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getSessionStudyContext } from "@/server/queries/workspace";
import { getSessionDetail } from "@/server/services/sessions";
import { getGuide } from "@/server/services/guides";
import { isAppError } from "@/server/services/errors";
import { can } from "@/lib/permissions";
import { isConversation } from "@/lib/interviews/sessions";
import { LiveSession } from "@/components/interviews/live-session";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("live");
  return { title: t("title") };
}

/** Focused, tab-free view used while the interview is happening. */
export default async function LivePage({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/sessions/[sessionId]/live">) {
  const { ws, projectId, studyId, sessionId } = await params;
  const { workspace, role, study, scope, base } = await getSessionStudyContext(ws, projectId, studyId);
  if (!can(role, "content:analyze")) notFound();
  let detail;
  try {
    detail = await getSessionDetail(workspace.id, study.id, sessionId);
  } catch (e) {
    if (isAppError(e)) notFound();
    throw e;
  }
  if (!isConversation(detail.session.kind)) notFound();
  const guide = await getGuide(workspace.id, study.id);
  const consentRequired = !!guide.consent;

  return (
    <LiveSession
      scope={scope}
      sessionId={detail.session.id}
      title={detail.session.title}
      backHref={`${base}/sessions/${detail.session.id}`}
      guide={guide.doc}
      initialNotes={[...detail.notes].reverse().map((n) => ({ id: n.id, atMs: n.atMs, tag: n.tag, text: n.text }))}
      missingConsent={consentRequired ? detail.participants.filter((p) => !p.consentAt).map((p) => p.code) : []}
      canRecord={!detail.session.mediaFileId}
      canEdit={can(role, "content:edit")}
    />
  );
}
