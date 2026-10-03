import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getSessionStudyContext } from "@/server/queries/workspace";
import { defaultConsent, getGuide } from "@/server/services/guides";
import { can } from "@/lib/permissions";
import { SegmentedNav } from "@/components/common/segmented-nav";
import { GuideBuilder } from "@/components/interviews/guide-builder";
import { ConsentEditor } from "@/components/interviews/consent-editor";
import { EmptyState } from "@/components/common/empty-state";
import { ClipboardIllustration } from "@/components/illustrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("guide");
  return { title: t("title") };
}

export default async function GuidePage({ params, searchParams }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/guide">) {
  const { ws, projectId, studyId } = await params;
  const { tab } = await searchParams;
  const { workspace, role, study, scope, base } = await getSessionStudyContext(ws, projectId, studyId);
  const t = await getTranslations("guide");
  const guide = await getGuide(workspace.id, study.id);
  const canEdit = can(role, "content:edit");
  const consentTab = tab === "consent";

  return (
    <div className="grid grid-cols-1 gap-6">
      <SegmentedNav
        label={t("sections")}
        items={[
          { href: `${base}/guide`, label: t("guideTab"), active: !consentTab },
          { href: `${base}/guide?tab=consent`, label: t("consentTab"), active: consentTab },
        ]}
      />
      {consentTab ? (
        <ConsentEditor scope={scope} initial={guide.consent ? { title: guide.consent.title, body: guide.consent.body, statements: guide.consent.statements } : defaultConsent()} version={guide.consent?.version ?? null} canEdit={canEdit} />
      ) : !canEdit && guide.doc.sections.length === 0 ? (
        <EmptyState illustration={<ClipboardIllustration />} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <GuideBuilder scope={scope} initial={guide.doc} canEdit={canEdit} />
      )}
    </div>
  );
}
