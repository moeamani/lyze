import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { db, dbDriver, dbPool } from "./index";

const migrationsFolder = path.join(/* turbopackIgnore: true */ process.cwd(), "drizzle");

let pending: Promise<void> | undefined;

/** Apply pending SQL migrations once per process. Safe to call repeatedly. */
export function runMigrations(): Promise<void> {
  pending ??= (async () => {
    if (dbDriver() === "pglite") {
      await migratePglite(db, { migrationsFolder });
    } else {
      // Several instances may start at once: a session-level advisory lock lets one migrate at a time.
      const client = await dbPool()!.connect();
      try {
        await client.query("select pg_advisory_lock(7354301)");
        await migratePg(drizzle(client) as unknown as NodePgDatabase, { migrationsFolder });
      } finally {
        await client.query("select pg_advisory_unlock(7354301)").catch(() => {});
        client.release();
      }
    }
  })();
  return pending;
}
