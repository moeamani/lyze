import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { memberships, workspaces, type Workspace } from "@/server/db/schema";
import { can, type Permission, type Role } from "@/lib/permissions";
import { AppError } from "./errors";

export type WorkspaceAccess = { workspace: Workspace; role: Role };

export async function getRole(userId: string, workspaceId: string): Promise<Role | null> {
  const [row] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.workspaceId, workspaceId)))
    .limit(1);
  return row?.role ?? null;
}

async function resolve(userId: string, where: ReturnType<typeof eq>): Promise<WorkspaceAccess> {
  const [row] = await db
    .select({ workspace: workspaces, role: memberships.role })
    .from(workspaces)
    .innerJoin(memberships, and(eq(memberships.workspaceId, workspaces.id), eq(memberships.userId, userId)))
    .where(where)
    .limit(1);
  // Non-members get "not found" rather than "forbidden" so workspace existence isn't leaked.
  if (!row) throw new AppError("notFound");
  return row;
}

/** Resolve a workspace by slug for a member and assert a permission. */
export async function requireWorkspaceBySlug(
  userId: string,
  slug: string,
  permission: Permission = "workspace:view",
): Promise<WorkspaceAccess> {
  const access = await resolve(userId, eq(workspaces.slug, slug));
  if (!can(access.role, permission)) throw new AppError("forbidden");
  return access;
}

export async function requireWorkspace(
  userId: string,
  workspaceId: string,
  permission: Permission = "workspace:view",
): Promise<WorkspaceAccess> {
  const access = await resolve(userId, eq(workspaces.id, workspaceId));
  if (!can(access.role, permission)) throw new AppError("forbidden");
  return access;
}
