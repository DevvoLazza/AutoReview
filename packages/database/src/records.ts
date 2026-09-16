import { Pool, type PoolClient } from "pg";

export type StoredRecord<T = unknown> = { id: string; version: number; value: T };
export interface RecordRepository {
  list<T>(tenantId: string, kind: string): Promise<StoredRecord<T>[]>;
  get<T>(tenantId: string, kind: string, id: string): Promise<StoredRecord<T> | null>;
  put<T>(
    tenantId: string,
    kind: string,
    id: string,
    value: T,
    expectedVersion: number | null,
    expiresAt?: string,
  ): Promise<StoredRecord<T> | null>;
  remove(tenantId: string, kind: string, id: string): Promise<void>;
  close(): Promise<void>;
}

/** Versioned aggregates: each transaction resets tenant scope before releasing its connection. */
export class PostgresRecordRepository implements RecordRepository {
  private readonly pool: Pool;
  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 10,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
  }
  private async scoped<T>(
    tenantId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query("SET LOCAL statement_timeout = '5s'");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async list<T>(tenantId: string, kind: string): Promise<StoredRecord<T>[]> {
    return this.scoped(
      tenantId,
      async (client) =>
        (
          await client.query(
            "SELECT id,version,payload AS value FROM runtime_records WHERE tenant_id=$1 AND kind=$2 AND (expires_at IS NULL OR expires_at>now())",
            [tenantId, kind],
          )
        ).rows,
    );
  }
  async get<T>(tenantId: string, kind: string, id: string): Promise<StoredRecord<T> | null> {
    return this.scoped(
      tenantId,
      async (client) =>
        (
          await client.query(
            "SELECT id,version,payload AS value FROM runtime_records WHERE tenant_id=$1 AND kind=$2 AND id=$3 AND (expires_at IS NULL OR expires_at>now())",
            [tenantId, kind, id],
          )
        ).rows[0] ?? null,
    );
  }
  async put<T>(
    tenantId: string,
    kind: string,
    id: string,
    value: T,
    expectedVersion: number | null,
    expiresAt?: string,
  ): Promise<StoredRecord<T> | null> {
    return this.scoped(tenantId, async (client) => {
      const result =
        expectedVersion === null
          ? await client.query(
              "INSERT INTO runtime_records(tenant_id,kind,id,payload,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id,version,payload AS value",
              [tenantId, kind, id, JSON.stringify(value), expiresAt ?? null],
            )
          : await client.query(
              "UPDATE runtime_records SET payload=$4,version=version+1,updated_at=now(),expires_at=COALESCE($6,expires_at) WHERE tenant_id=$1 AND kind=$2 AND id=$3 AND version=$5 RETURNING id,version,payload AS value",
              [tenantId, kind, id, JSON.stringify(value), expectedVersion, expiresAt ?? null],
            );
      return result.rows[0] ?? null;
    });
  }
  async remove(tenantId: string, kind: string, id: string): Promise<void> {
    await this.scoped(tenantId, async (client) => {
      await client.query("DELETE FROM runtime_records WHERE tenant_id=$1 AND kind=$2 AND id=$3", [
        tenantId,
        kind,
        id,
      ]);
    });
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}

export class MemoryRecordRepository implements RecordRepository {
  private readonly entries = new Map<string, StoredRecord & { expiresAt?: string }>();
  private key(tenantId: string, kind: string, id: string) {
    return `${tenantId}/${kind}/${id}`;
  }
  async list<T>(tenantId: string, kind: string): Promise<StoredRecord<T>[]> {
    return [...this.entries.entries()]
      .filter(
        ([key, entry]) =>
          key.startsWith(`${tenantId}/${kind}/`) &&
          (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.now()),
      )
      .map(([, entry]) => structuredClone(entry) as StoredRecord<T>);
  }
  async get<T>(tenantId: string, kind: string, id: string): Promise<StoredRecord<T> | null> {
    const entry = this.entries.get(this.key(tenantId, kind, id));
    return entry && (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.now())
      ? (structuredClone(entry) as StoredRecord<T>)
      : null;
  }
  async put<T>(
    tenantId: string,
    kind: string,
    id: string,
    value: T,
    expectedVersion: number | null,
    expiresAt?: string,
  ): Promise<StoredRecord<T> | null> {
    const key = this.key(tenantId, kind, id);
    const current = this.entries.get(key);
    if (expectedVersion === null ? Boolean(current) : current?.version !== expectedVersion)
      return null;
    const result = {
      id,
      version: (current?.version ?? 0) + 1,
      value: structuredClone(value),
      expiresAt: expiresAt ?? current?.expiresAt,
    };
    this.entries.set(key, result);
    return structuredClone(result);
  }
  async remove(tenantId: string, kind: string, id: string): Promise<void> {
    this.entries.delete(this.key(tenantId, kind, id));
  }
  async close(): Promise<void> {}
}
