import "server-only";
import { cookies } from "next/headers";
import { LAST_WORKSPACE_COOKIE } from "@/lib/constants";

export async function rememberWorkspace(slug: string) {
  (await cookies()).set(LAST_WORKSPACE_COOKIE, slug, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function lastWorkspaceSlug(): Promise<string | undefined> {
  return (await cookies()).get(LAST_WORKSPACE_COOKIE)?.value;
}
