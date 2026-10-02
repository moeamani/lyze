import "server-only";
import { NodePgDatabase, drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { PgliteDatabase, drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

type DbState = { db: Database; driver: "postgres" | "pglite"; pglite?: PGlite };

const globalForDb = globalThis as unknown as { __lyzeDb?: DbState };

function pgliteDir(): string {
  const dir = process.env.PGLITE_DIR?.trim();
  if (dir === "memory://") return dir;
  const resolved = path.resolve(/* turbopackIgnore: true */ dir || "./.data/pglite");
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function create(): DbState {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const pool = new Pool({ connectionString: url, max: 10 });
    // Both drivers expose the same Drizzle query API for the pg dialect.
    return { db: drizzlePg(pool, { schema }) as unknown as Database, driver: "postgres" };
  }
  const pglite = new PGlite(pgliteDir());
  return { db: drizzlePglite(pglite, { schema }), driver: "pglite", pglite };
}

function state(): DbState {
  // Reuse one connection across hot reloads in dev.
  globalForDb.__lyzeDb ??= create();
  return globalForDb.__lyzeDb;
}

/**
 * Lazily-connected database. The connection opens on first use, so importing this module
 * (e.g. while Next collects route config at build time) never touches the database.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = state().db;
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return Reflect.has(state().db, prop);
  },
  // Lets `instanceof` / Drizzle's `is()` checks (the Auth.js adapter runs one at import time) see the
  // right class without opening a connection.
  getPrototypeOf() {
    return (process.env.DATABASE_URL?.trim() ? NodePgDatabase : PgliteDatabase).prototype;
  },
});

export function dbDriver() {
  return state().driver;
}

export { schema };
