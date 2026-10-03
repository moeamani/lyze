import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getWorkspaceContext } from "@/server/queries/workspace";
import { WEBHOOK_EVENTS, listApiKeys, listWebhooks } from "@/server/services/api";
import { can } from "@/lib/permissions";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { NoAccess } from "@/components/common/no-access";
import { ApiSettings } from "@/components/settings/api-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("apiSettings");
  return { title: t("title") };
}

export default async function ApiSettingsPage({ params }: PageProps<"/w/[ws]/settings/api">) {
  const { ws } = await params;
  const { workspace, role } = await getWorkspaceContext(ws);
  const t = await getTranslations("apiSettings");
  const canManage = can(role, "workspace:manage");
  if (!canManage) {
    return (
      <PageContainer className="max-w-3xl">
        <NoAccess />
      </PageContainer>
    );
  }
  const [keys, hooks, h] = await Promise.all([listApiKeys(workspace.id), listWebhooks(workspace.id), headers()]);
  const origin = process.env.APP_URL || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <ApiSettings scope={{ workspaceId: workspace.id, slug: workspace.slug }} keys={keys} hooks={hooks} events={WEBHOOK_EVENTS} origin={origin} canManage={canManage} />
    </PageContainer>
  );
}
