import "server-only";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { EmailConfig } from "next-auth/providers";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { accounts, sessions, users, verificationTokens } from "@/server/db/schema";
import { sendMail } from "@/server/mail";
import { signInEmail } from "@/server/mail/templates";

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
/** Magic-link sign-in needs a mail provider, so it is off until AUTH_EMAIL_ENABLED=1. */
export const emailSignInEnabled = process.env.AUTH_EMAIL_ENABLED === "1";

const magicLink: EmailConfig = {
  id: "email",
  type: "email",
  name: "Email",
  from: process.env.EMAIL_FROM || "Lyze <hello@lyze.local>",
  maxAge: 24 * 60 * 60,
  options: {},
  async sendVerificationRequest({ identifier, url }) {
    const { host } = new URL(url);
    await sendMail({ to: identifier, url, ...signInEmail(url, host) });
  },
};

const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const DEV_SECRET = "lyze-development-secret-do-not-use-in-production";

const config: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database", maxAge: SESSION_MAX_AGE },
  secret: process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? DEV_SECRET : undefined),
  // Self-hosted deployments usually sit behind a proxy that sets X-Forwarded-Host.
  trustHost: process.env.AUTH_TRUST_HOST !== "false",
  providers: [...(emailSignInEnabled ? [magicLink] : []), ...(googleEnabled ? [Google({ allowDangerousEmailAccountLinking: true })] : [])],
  pages: { signIn: "/sign-in", verifyRequest: "/sign-in/check-email", error: "/sign-in" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

export type SessionUser = {
  id: string;
  name: string | null;
  /** Null for username/password accounts. */
  email: string | null;
  username: string | null;
  /** What to show for the person when they have no name: their email or username. */
  handle: string;
  image: string | null;
  devMode: boolean;
};

/** The signed-in user for this request, or null. Deduplicated per request. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) return null;
  const handle = u.email ?? u.username;
  if (!handle) return null;
  return { id: u.id, name: u.name, email: u.email, username: u.username, handle, image: u.image, devMode: u.devMode };
});

/**
 * Sign a user in after checking their password ourselves. Auth.js's credentials provider only
 * works with JWT sessions, so this creates the same database session and cookie Auth.js would.
 */
export async function startSession(userId: string) {
  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_MAX_AGE * 1000);
  await db.insert(sessions).values({ sessionToken, userId, expires });
  const h = await headers();
  const proto = process.env.AUTH_URL ? new URL(process.env.AUTH_URL).protocol : `${(h.get("x-forwarded-proto")?.split(",")[0]?.trim() || (h.get("origin")?.startsWith("https:") ? "https" : "http"))}:`;
  const secure = proto === "https:";
  (await cookies()).set(`${secure ? "__Secure-" : ""}authjs.session-token`, sessionToken, { httpOnly: true, sameSite: "lax", path: "/", secure, expires });
}

/** Require a signed-in user in a Server Component / Action, redirecting to sign-in otherwise. */
export async function requireUser(callbackUrl?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(callbackUrl ? `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/sign-in");
  return user;
}
