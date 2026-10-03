import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { getTranslations } from "next-intl/server";
import { DownloadIcon, ExternalLinkIcon, PencilRulerIcon } from "lucide-react";
import { getStudyContext } from "@/server/queries/workspace";
import { getFormForStudy } from "@/server/services/forms";
import { listFormInvites } from "@/server/services/responses";
import { appUrl } from "@/server/url";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { CopyField } from "@/components/distribute/copy-field";
import { InviteForm } from "@/components/distribute/invite-form";
import { ClipboardIllustration } from "@/components/illustrations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("distribute");
  return { title: t("title") };
}

export default async function SharePage({ params }: PageProps<"/w/[ws]/p/[projectId]/s/[studyId]/share">) {
  const { ws, projectId, studyId } = await params;
  const { workspace, role, study } = await getStudyContext(ws, projectId, studyId);
  const t = await getTranslations("distribute");
  const tb = await getTranslations("builder");
  const ts = await getTranslations("studyStatus");
  const form = await getFormForStudy(workspace.id, study.id);
  const base = `/w/${ws}/p/${projectId}/s/${studyId}`;

  if (!form?.publishedVersion) {
    return (
      <EmptyState illustration={<ClipboardIllustration />} title={t("notPublishedTitle")} description={t("notPublishedBody")}>
        <Button asChild>
          <Link href={`${base}/build`}>
            <PencilRulerIcon />
            {t("openBuilder")}
          </Link>
        </Button>
      </EmptyState>
    );
  }

  const origin = await appUrl();
  const url = `${origin}/f/${form.publicId}`;
  const qr = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#1f1f23", light: "#ffffff" } });
  const embed = `<iframe src="${url}?embed=1" title="${form.draft.title.replace(/"/g, "&quot;")}" style="width:100%;border:0;min-height:520px" loading="lazy"></iframe>\n<script src="${origin}/embed.js" async></script>`;
  const invites = await listFormInvites(form.id);
  const canEdit = can(role, "content:edit");

  return (
    <div className="grid gap-6">
      {study.status !== "live" && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">{t("closedNotice", { status: ts(study.status).toLowerCase() })}</p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card>
          <CardHeader>
            <CardTitle>{t("link")}</CardTitle>
            <CardDescription>
              {t("linkHint")} {t("mode", { mode: tb(`oneResponseModes.${form.draft.settings.oneResponse}`) })}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <CopyField value={url} label={t("link")} />
            <Button asChild variant="ghost" className="w-fit">
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLinkIcon />
                {t("open")}
              </a>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("qr")}</CardTitle>
            <CardDescription>{t("qrHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid justify-items-center gap-3">
            <div className="w-40 rounded-xl bg-white p-2" role="img" aria-label={`${t("qr")}: ${url}`} dangerouslySetInnerHTML={{ __html: qr }} />
            <Button asChild variant="outline" size="sm">
              <a href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} download={`lyze-${form.publicId}.svg`}>
                <DownloadIcon />
                {t("downloadSvg")}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t("embed")}</CardTitle>
          <CardDescription>{t("embedHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CopyField value={embed} label={t("embed")} multiline />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("invites")}</CardTitle>
          <CardDescription>{t("invitesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {canEdit && <InviteForm scope={{ workspaceId: workspace.id, slug: ws, projectId, studyId }} formId={form.id} />}
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">{t("inviteList")}</h3>
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noInvites")}</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {invites.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{inv.email}</span>
                    <span className="text-xs text-muted-foreground">
                      <RelativeTime date={inv.sentAt ?? inv.createdAt} />
                    </span>
                    <Badge variant={inv.status === "complete" ? "success" : inv.status ? "soft" : "outline"}>{t(`inviteStatus.${inv.status ?? "notStarted"}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
