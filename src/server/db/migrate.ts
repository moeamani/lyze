// CLI: `npm run db:migrate` — applies migrations to DATABASE_URL (or the local PGlite DB).
import { runMigrations } from "./migrations";

runMigrations()
  .then(() => {
    console.log("✓ Migrations applied");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
