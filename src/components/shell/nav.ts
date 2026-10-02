import { ActivityIcon, FolderKanbanIcon, HomeIcon, SettingsIcon, UsersIcon, type LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/permissions";

export type NavItem = {
  key: "home" | "projects" | "activity" | "members" | "settings";
  href: (slug: string) => string;
  icon: LucideIcon;
  /** Exact match only (for the workspace root). */
  exact?: boolean;
  permission?: Permission;
};

export const NAV_ITEMS: NavItem[] = [
  { key: "home", href: (s) => `/w/${s}`, icon: HomeIcon, exact: true },
  { key: "projects", href: (s) => `/w/${s}/projects`, icon: FolderKanbanIcon },
  { key: "activity", href: (s) => `/w/${s}/activity`, icon: ActivityIcon, permission: "audit:view" },
  { key: "members", href: (s) => `/w/${s}/settings/members`, icon: UsersIcon },
  { key: "settings", href: (s) => `/w/${s}/settings`, icon: SettingsIcon, exact: true },
];

export function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
