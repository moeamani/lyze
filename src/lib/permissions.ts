export const ROLES = ["owner", "editor", "analyst", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "workspace:view",
  "workspace:manage",
  "members:manage",
  "content:edit",
  "content:analyze",
  "audit:view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  editor: ["workspace:view", "content:edit", "content:analyze", "audit:view"],
  analyst: ["workspace:view", "content:analyze"],
  viewer: ["workspace:view"],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return GRANTS[role].includes(permission);
}

/** Lower number = more privileges. */
const RANK: Record<Role, number> = { owner: 0, editor: 1, analyst: 2, viewer: 3 };

export function isAtLeast(role: Role, minimum: Role): boolean {
  return RANK[role] <= RANK[minimum];
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
