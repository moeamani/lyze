import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileTextIcon, PenLineIcon } from "lucide-react";
import { getProjectContext } from "@/server/queries/workspace";
import { getBrief, listWriteups } from "@/server/services/writeup";
import { assistProvider } from "@/server/ai";
import { can } from "@/lib/permissions";
import { SectionIntro } from "@/components/common/section-icon";
import { RelativeTime } from "@/components/common/relative-time";
import { BriefEditor } from "@/components/writeup/brief-editor";
import { GenerateButton } from "@/components/writeup/generate-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("writeup");
  return { title: t("title") };
}

export default async function WriteupPage({ params }: PageProps<"/w/[ws]/p/[projectId]/writeup">) {
  const { ws, projectId } = await params;
  const { workspace, role, project } = await getProjectContext(ws, projectId);
  const t = await getTranslations("writeup");
  const [brief, list] = await Promise.all([getBrief(workspace.id, project.id), listWriteups(workspace.id, project.id)]);
  const scope = { workspaceId: workspace.id, slug: workspace.slug, projectId: project.id };
  const base = `/w/${ws}/p/${projectId}/writeup`;
  const ai = assistProvider().name;
  const canAnalyze = can(role, "content:analyze");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid min-w-0 grid-cols-1 content-start gap-5">
        <SectionIntro section="writeup" icon={PenLineIcon} title={t("title")} description={t("intro")} actions={canAnalyze && <GenerateButton scope={scope} base={base} />} />
        <p className="rounded-lg bg-section-writeup/8 px-3 py-2 text-sm text-pretty">{ai === "claude" ? t("providerClaude") : t("providerBuiltin")}</p>
        <BriefEditor
          key={brief.updatedAt.toISOString()}
          scope={scope}
          canEdit={can(role, "content:edit")}
          brief={{ aim: brief.aim, questions: brief.questions, statements: brief.statements, proposalName: brief.proposalName, proposalReadable: brief.proposalText !== null }}
        />
      </div>
      <aside aria-labelledby="drafts-title" className="grid content-start gap-2">
        <h3 id="drafts-title" className="text-sm font-semibold">{t("drafts")}</h3>
        {list.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("noDrafts")}</p>
        ) : (
          <ul className="grid gap-1">
            {list.map((w) => (
              <li key={w.id}>
                <Link href={`${base}/${w.id}`} className="flex items-start gap-2 rounded-lg p-2 hover:bg-accent">
                  <FileTextIcon className="mt-0.5 size-4 shrink-0 text-section-writeup" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{w.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {w.provider === "claude" ? "Claude" : t("builtin")} · <RelativeTime date={w.createdAt} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
