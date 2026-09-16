import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for migrations");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)),
  });
  if (process.env.PROVISION_RUNTIME_ROLE === "true") {
    await pool.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='reviewguard_runtime') THEN CREATE ROLE reviewguard_runtime NOLOGIN NOCREATEROLE NOCREATEDB; END IF; END $$",
    );
    await pool.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    await pool.query("GRANT USAGE ON SCHEMA public TO reviewguard_runtime");
    await pool.query(
      "GRANT SELECT,INSERT,UPDATE,DELETE ON runtime_records,runtime_knowledge_chunks TO reviewguard_runtime",
    );
    await pool.query(
      "REVOKE TRUNCATE,TRIGGER,REFERENCES ON runtime_records,runtime_knowledge_chunks FROM reviewguard_runtime",
    );
  }
  console.info("Database migrations completed.");
} catch (error) {
  // Do not expose connection strings or SQL payloads in deployment logs.
  console.error("Database migration failed.", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
} finally {
  await pool.end();
}
