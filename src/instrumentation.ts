export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` also loads instrumentation (once per worker); never touch the database there.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Apply migrations automatically for the embedded dev database (and when opted in for Postgres).
  // On Vercel they run during the build instead (scripts/prebuild.mjs), so cold starts stay fast.
  const external = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (process.env.VERCEL && !external) return; // The setup page explains what's missing.
  if (!external || process.env.DB_AUTO_MIGRATE === "1") {
    try {
      const { runMigrations } = await import("./server/db/migrations");
      await runMigrations();
    } catch (error) {
      // Keep the server up: pages show the error instead of the whole app failing to start.
      console.error("Database migrations failed", error);
    }
  }
}
