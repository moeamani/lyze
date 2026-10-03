import { NextResponse, type NextRequest } from "next/server";
import { LAST_WORKSPACE_COOKIE } from "@/lib/constants";

/** Remember the last-visited workspace so `/` can send people straight back to it. */
export function proxy(request: NextRequest) {
  const slug = request.nextUrl.pathname.split("/")[2];
  const response = NextResponse.next();
  if (slug && request.cookies.get(LAST_WORKSPACE_COOKIE)?.value !== slug) {
    response.cookies.set(LAST_WORKSPACE_COOKIE, slug, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return response;
}

export const config = { matcher: "/w/:slug/:path*" };
