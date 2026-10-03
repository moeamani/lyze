import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getWorkspaceContext } from "@/server/queries/workspace";
import { can } from "@/lib/permissions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { DeleteWorkspace, WorkspaceSettingsForm } from "@/components/workspace/workspace-settings-form";
import { LeaveWorkspace } from "@/components/members/member-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage({ params }: PageProps<"/w/[ws]/settings">) {
  const { ws } = await params;
  const { user, workspace, role } = await getWorkspaceContext(ws);
  const t = await getTranslations("settings");
  const tr = await getTranslations("roles");
  const manage = can(role, "workspace:manage");
  const scope = { workspaceId: workspace.id, slug: workspace.slug };

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title={t("title")} description={t("subtitle")} />
      {manage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("general")}</CardTitle>
            <CardDescription>{t("generalHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceSettingsForm workspace={workspace} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{workspace.name}</CardTitle>
            <CardDescription>{t("yourRole", { role: tr(role) })}</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{t("readOnlyHint")}</CardContent>
        </Card>
      )}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>{t("dangerZone")}</CardTitle>
          <CardDescription>{manage ? t("dangerHintOwner") : t("dangerHintMember")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <LeaveWorkspace scope={scope} userId={user.id} workspaceName={workspace.name} />
          {manage && <DeleteWorkspace workspace={workspace} />}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
