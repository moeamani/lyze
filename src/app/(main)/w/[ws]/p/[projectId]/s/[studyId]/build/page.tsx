import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStudyContext } from "@/server/queries/workspace";
import { getFormForStudy, getPublishedDoc } from "@/server/services/forms";
import { captchaSiteKey } from "@/server/captcha";
import { can } from "@/lib/permissions";
import { collectsResponses } from "@/lib/studies";
import { Builder } from "@/components/builder/builder";
import { CreateOptions } from "@/components/common/create-options";
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
    if (canEdit) {
      const t = await getTranslations("create");
      return (
        <>
          <div className="mx-auto grid w-full max-w-4xl gap-4 px-4 pt-8 sm:px-6 md:pt-12">
            <div className="space-y-1.5">
              <h1 className="text-2xl font-semibold">{t("questionnaireTitle")}</h1>
              <p className="text-muted-foreground">{t("questionnaireHint")}</p>
            </div>
            <CreateOptions scope={scope} kind="questionnaire" manual={{ href: "#templates" }} />
          </div>
          <div id="templates">
            <TemplatePicker scope={scope} />
          </div>
        </>
      );
    }
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
