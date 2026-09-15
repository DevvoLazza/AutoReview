import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema.js";

export type ReviewGuardDatabase = ReturnType<typeof createDatabase>["db"];

export function createDatabase(connectionString: string, config: PoolConfig = {}) {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ...config,
  });
  return { db: drizzle(pool, { schema }), pool };
}

export async function withTenant<T>(
  database: ReviewGuardDatabase,
  tenantId: string,
  operation: (
    transaction: Parameters<Parameters<ReviewGuardDatabase["transaction"]>[0]>[0],
  ) => Promise<T>,
): Promise<T> {
  return database.transaction(async (transaction) => {
    await transaction.execute(
      `select set_config('app.tenant_id', '${tenantId.replaceAll("'", "")}', true)`,
    );
    return operation(transaction);
  });
}
