import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStudyContext } from "@/server/queries/workspace";
import { getFormForStudy, getPublishedDoc } from "@/server/services/forms";
import { captchaSiteKey } from "@/server/captcha";
import { can } from "@/lib/permissions";
import { collectsResponses } from "@/lib/studies";
import { Builder } from "@/components/builder/builder";
import { TemplatePicker } from "@/components/builder/template-picker";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/common/page-header";
import { ClipboardIllustration } from "@/components/illustrations";

export async function generateMetadata({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/build">): Promise<Metadata> {
  const { ws, projectId, studyId } = await params;
  const { study } = await getStudyContext(ws, projectId, studyId);
  const t = await getTranslations("builder");
  return { title: `${t("title")} · ${study.name}` };
}

export default async function BuildPage({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/build">) {
  const { ws, projectId, studyId } = await params;
  const { workspace, role, study } = await getStudyContext(ws, projectId, studyId);
  if (!collectsResponses(study.type)) notFound();
  const canEdit = can(role, "content:edit");
  const scope = { workspaceId: workspace.id, slug: workspace.slug, projectId, studyId };
  const form = await getFormForStudy(workspace.id, study.id);

  if (!form) {
    if (canEdit) return <TemplatePicker scope={scope} />;
    const t = await getTranslations("studies");
    return (
      <PageContainer>
        <EmptyState illustration={<ClipboardIllustration />} title={t("formStatus.none")} description={t("formCardHint")} />
      </PageContainer>
    );
  }

  const published = form.publishedVersion ? await getPublishedDoc(form.id, form.publishedVersion) : null;
  return (
    <Builder
      key={form.id}
      scope={scope}
      formId={form.id}
      initialDoc={form.draft}
      publishedDoc={published}
      publishedVersion={form.publishedVersion}
      canEdit={canEdit}
      captchaAvailable={!!captchaSiteKey()}
    />
  );
}
