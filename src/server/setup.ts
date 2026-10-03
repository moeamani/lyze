import "server-only";

export type SetupProblem = { key: "database" | "authSecret"; title: string; fix: string };

/**
 * Settings the app can't run without on this host. Shown as a setup page instead of crashing, so a
 * fresh deployment says what to do. Server-only: reads environment variables, never their values.
 */
export function setupProblems(): SetupProblem[] {
  const problems: SetupProblem[] = [];
  const onVercel = !!process.env.VERCEL;
  if (onVercel && !(process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim()))
    problems.push({
      key: "database",
      title: "Connect a Postgres database",
      fix: "In your Vercel project open Storage → Create Database → Neon (free) and connect it to this project. That sets DATABASE_URL. Then redeploy: the build applies Lyze's tables.",
    });
  if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET?.trim())
    problems.push({
      key: "authSecret",
      title: "Set AUTH_SECRET",
      fix: "Add an environment variable AUTH_SECRET with a long random value (run `openssl rand -base64 32`). It signs sign-in sessions and encrypts stored API keys, so keep it secret and don't change it later.",
    });
  return problems;
}
