import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ?? "postgres://reviewguard:reviewguard@localhost:5432/reviewguard",
  },
  strict: true,
  verbose: true,
});
