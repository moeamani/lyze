// Runs before `next build` (npm "prebuild"). On Vercel, apply database migrations while the build
// machine still has the SQL files, so serverless functions start without migrating.
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
if (!process.env.VERCEL) process.exit(0);
if (!url) {
  console.warn("⚠ No DATABASE_URL / POSTGRES_URL: skipping migrations. Connect a Postgres database (e.g. Neon) in Vercel → Storage, then redeploy.");
  process.exit(0);
}
const result = spawnSync("npx", ["tsx", "--conditions=react-server", "src/server/db/migrate.ts"], { stdio: "inherit" });
process.exit(result.status ?? 1);
