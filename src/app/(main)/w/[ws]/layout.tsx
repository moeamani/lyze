import { cookies } from "next/headers";
import { getWorkspaceContext } from "@/server/queries/workspace";
import { listUserWorkspaces } from "@/server/services/workspaces";
import { listProjects } from "@/server/services/projects";
import { AppShell } from "@/components/shell/app-shell";
import { AiModeProvider } from "@/components/common/ai-mode";
import { aiStatus } from "@/server/services/ai-settings";
import { SIDEBAR_COOKIE } from "@/lib/constants";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/w/[ws]">) {
  const { ws } = await params;
  const { user, workspace, role } = await getWorkspaceContext(ws);
  const [workspaces, projects, cookieStore, ai] = await Promise.all([
    listUserWorkspaces(user.id),
    listProjects(workspace.id),
    cookies(),
    aiStatus(workspace.id),
  ]);

  return (
    <AppShell
      workspace={{ id: workspace.id, name: workspace.name, slug: workspace.slug, role }}
      workspaces={workspaces}
      user={user}
      projects={projects.slice(0, 8).map((p) => ({ id: p.id, name: p.name, color: p.color }))}
      defaultCollapsed={cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed"}
    >
      <AiModeProvider value={{ workspaceId: workspace.id, lyze: ai.lyze, own: ai.own?.provider ?? null, canPlaceholder: user.devMode, settingsHref: `/w/${ws}/settings/ai` }}>{children}</AiModeProvider>
    </AppShell>
  );
}
