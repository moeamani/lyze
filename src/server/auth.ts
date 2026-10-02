import "server-only";
import NextAuth, { type NextAuthConfig } from "next-auth";
import type { EmailConfig } from "next-auth/providers";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/server/db";
import { accounts, sessions, users, verificationTokens } from "@/server/db/schema";
import { sendMail } from "@/server/mail";
import { signInEmail } from "@/server/mail/templates";

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

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

const DEV_SECRET = "lyze-development-secret-do-not-use-in-production";

const config: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.AUTH_SECRET || (process.env.NODE_ENV !== "production" ? DEV_SECRET : undefined),
  // Self-hosted deployments usually sit behind a proxy that sets X-Forwarded-Host.
  trustHost: process.env.AUTH_TRUST_HOST !== "false",
  providers: [magicLink, ...(googleEnabled ? [Google({ allowDangerousEmailAccountLinking: true })] : [])],
  pages: { signIn: "/sign-in", verifyRequest: "/sign-in/check-email", error: "/sign-in" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

export type SessionUser = { id: string; name: string | null; email: string; image: string | null };

/** The signed-in user for this request, or null. Deduplicated per request. */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, name: user.name ?? null, email: user.email, image: user.image ?? null };
});

/** Require a signed-in user in a Server Component / Action, redirecting to sign-in otherwise. */
export async function requireUser(callbackUrl?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect(callbackUrl ? `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/sign-in");
  return user;
}
