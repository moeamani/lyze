export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `next build` also loads instrumentation (once per worker); never touch the database there.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  // Apply migrations automatically for the embedded dev database (and when opted in for Postgres).
  if (!process.env.DATABASE_URL || process.env.DB_AUTO_MIGRATE === "1") {
    const { runMigrations } = await import("./server/db/migrations");
    await runMigrations();
  }
}
