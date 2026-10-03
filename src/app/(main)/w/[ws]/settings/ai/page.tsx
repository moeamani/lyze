import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getWorkspaceContext } from "@/server/queries/workspace";
import { aiStatus } from "@/server/services/ai-settings";
import { can } from "@/lib/permissions";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { AiSettingsForm } from "@/components/settings/ai-settings-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("aiSettings");
  return { title: t("title") };
}

export default async function AiSettingsPage({ params }: PageProps<"/w/[ws]/settings/ai">) {
  const { ws } = await params;
  const { workspace, role } = await getWorkspaceContext(ws);
  const t = await getTranslations("aiSettings");
  const status = await aiStatus(workspace.id);
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <AiSettingsForm scope={{ workspaceId: workspace.id, slug: workspace.slug }} status={status} canManage={can(role, "workspace:manage")} />
    </PageContainer>
  );
}
