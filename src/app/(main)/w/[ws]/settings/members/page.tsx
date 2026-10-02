import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MailIcon } from "lucide-react";
import { getWorkspaceContext } from "@/server/queries/workspace";
import { listMembers, listPendingInvites } from "@/server/services/members";
import { can } from "@/lib/permissions";
import { initials } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageContainer, PageHeader } from "@/components/common/page-header";
import { RelativeTime } from "@/components/common/relative-time";
import { InviteDialog, RemoveMemberButton, RevokeInviteButton, RoleSelect } from "@/components/members/member-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("members");
  return { title: t("title") };
}

export default async function MembersPage({ params }: PageProps<"/w/[ws]/settings/members">) {
  const { ws } = await params;
  const { user, workspace, role } = await getWorkspaceContext(ws);
  const t = await getTranslations("members");
  const tr = await getTranslations("roles");
  const manage = can(role, "members:manage");
  const [members, invites] = await Promise.all([listMembers(workspace.id), manage ? listPendingInvites(workspace.id) : []]);
  const scope = { workspaceId: workspace.id, slug: workspace.slug };

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title={t("title")}
        description={t("subtitle", { count: members.length })}
        actions={manage && <InviteDialog scope={scope} />}
      />

      <Card className="gap-0 py-2">
        <ul className="divide-y">
          {members.map((m) => {
            const name = m.name || m.email || "";
            const self = m.userId === user.id;
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                <Avatar className="size-10">
                  {m.image && <AvatarImage src={m.image} alt="" />}
                  <AvatarFallback>{initials(name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    <span className="truncate">{m.name || m.email}</span>
                    {self && <Badge variant="secondary">{t("you")}</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {m.email} · {t("joined")} <RelativeTime date={m.joinedAt} />
                  </p>
                </div>
                <div className="flex w-full items-center justify-end gap-1 sm:ms-auto sm:w-auto">
                  {manage ? (
                    <RoleSelect scope={scope} userId={m.userId} role={m.role} label={t("roleFor", { name })} />
                  ) : (
                    <Badge variant="soft">{tr(m.role)}</Badge>
                  )}
                  {manage && !self && <RemoveMemberButton scope={scope} userId={m.userId} name={name} />}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {manage && invites.length > 0 && (
        <Card className="gap-2">
          <CardHeader>
            <CardTitle className="text-base">{t("pending")}</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y">
              {invites.map((inv) => (
                <li key={inv.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    <MailIcon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{inv.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {tr(inv.role)} · {t("expires")} <RelativeTime date={inv.expiresAt} />
                    </p>
                  </div>
                  <RevokeInviteButton scope={scope} inviteId={inv.id} email={inv.email} />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("rolesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {(["owner", "editor", "analyst", "viewer"] as const).map((r) => (
              <div key={r} className="rounded-xl bg-muted/60 p-3">
                <dt className="font-medium">{tr(r)}</dt>
                <dd className="text-muted-foreground">{t(`roleHints.${r}`)}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
