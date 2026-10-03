import "server-only";
import { NodePgDatabase, drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { PgliteDatabase, drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

type DbState = { db: Database; driver: "postgres" | "pglite"; pglite?: PGlite; pool?: Pool };

const globalForDb = globalThis as unknown as { __lyzeDb?: DbState };

/**
 * The Postgres connection string. Vercel's Neon / Supabase / Postgres integrations set
 * DATABASE_URL or POSTGRES_URL, so either works.
 */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || undefined;
}

/** Thrown when the app runs on a serverless host with no database configured. */
export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("No database configured. On Vercel, connect a Postgres database (e.g. Neon) so DATABASE_URL is set.");
    this.name = "DatabaseNotConfiguredError";
  }
}

function pgliteDir(): string {
  const dir = process.env.PGLITE_DIR?.trim();
  if (dir === "memory://") return dir;
  const resolved = path.resolve(/* turbopackIgnore: true */ dir || "./.data/pglite");
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function create(): DbState {
  const url = databaseUrl();
  if (url) {
    const serverless = !!process.env.VERCEL;
    // Serverless instances are many and short-lived: keep few connections each and let idle ones go.
    const pool = new Pool({ connectionString: url, max: serverless ? 3 : 10, idleTimeoutMillis: serverless ? 5_000 : 30_000, connectionTimeoutMillis: 10_000 });
    // On Vercel, close idle connections before an instance is suspended.
    if (serverless) attachDatabasePool(pool);
    // Both drivers expose the same Drizzle query API for the pg dialect.
    return { db: drizzlePg(pool, { schema }) as unknown as Database, driver: "postgres", pool };
  }
  // The embedded database writes to local disk, which serverless hosts don't keep (or can't write).
  if (process.env.VERCEL) throw new DatabaseNotConfiguredError();
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
    return (databaseUrl() ? NodePgDatabase : PgliteDatabase).prototype;
  },
});

export function dbDriver() {
  return state().driver;
}

/** The Postgres pool (null for the embedded database). */
export function dbPool() {
  return state().pool ?? null;
}

export { schema };
