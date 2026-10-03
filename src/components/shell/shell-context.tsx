"use client";

import * as React from "react";
import type { Role } from "@/lib/permissions";

export type ShellWorkspace = { id: string; name: string; slug: string; role: Role };
export type ShellUser = { id: string; name: string | null; email: string | null; handle: string; image: string | null };
export type ShellProject = { id: string; name: string; color: string };

type ShellContextValue = {
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  user: ShellUser;
  projects: ShellProject[];
  openPalette: () => void;
};

const ShellContext = React.createContext<ShellContextValue | null>(null);

export function ShellProvider({ value, children }: { value: ShellContextValue; children: React.ReactNode }) {
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell() {
  const ctx = React.useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside <AppShell>");
  return ctx;
}

/** Shell data when available (e.g. palette actions), null outside the app shell. */
export function useOptionalShell() {
  return React.useContext(ShellContext);
}
