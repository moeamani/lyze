// Every test run gets a fresh, in-memory Postgres (PGlite) with real migrations applied.
process.env.PGLITE_DIR = "memory://";
delete process.env.DATABASE_URL;
