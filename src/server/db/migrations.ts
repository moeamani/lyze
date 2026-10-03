import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { db, dbDriver } from "./index";

const migrationsFolder = path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle");

let pending: Promise<void> | undefined;

/** Apply pending SQL migrations once per process. Safe to call repeatedly. */
export function runMigrations(): Promise<void> {
  pending ??= (async () => {
    if (dbDriver() === "pglite") {
      await migratePglite(db, { migrationsFolder });
    } else {
      await migratePg(db as unknown as NodePgDatabase, { migrationsFolder });
    }
  })();
  return pending;
}
