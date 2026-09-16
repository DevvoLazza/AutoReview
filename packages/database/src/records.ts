import type { KnowledgeExcerpt } from "@reviewguard/contracts";
import { Pool, type PoolClient } from "pg";
import { type IndexedKnowledgeChunk, vectorParameter } from "./knowledge-index.js";

export type StoredRecord<T = unknown> = { id: string; version: number; value: T };
export type RecordWrite = {
  kind: string;
  id: string;
  value: unknown;
  expectedVersion: number | null;
  expiresAt?: string;
};
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
  putMany(tenantId: string, writes: RecordWrite[]): Promise<boolean>;
  removeKind(tenantId: string, kind: string): Promise<number>;
  purgeExpired(tenantId: string): Promise<number>;
  replaceKnowledgeChunks(
    tenantId: string,
    sourceId: string,
    version: number,
    chunks: IndexedKnowledgeChunk[],
  ): Promise<void>;
  searchKnowledge(
    tenantId: string,
    locationId: string,
    query: string,
    embedding: number[],
    model: string,
  ): Promise<KnowledgeExcerpt[]>;
  close(): Promise<void>;
}

/** Versioned aggregates: each transaction resets tenant scope before releasing its connection. */
export class PostgresRecordRepository implements RecordRepository {
  private readonly pool: Pool;
  constructor(connectionString: string, pool?: Pool) {
    this.pool =
      pool ??
      new Pool({
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
              "INSERT INTO runtime_records(tenant_id,kind,id,payload,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,kind,id) DO UPDATE SET payload=EXCLUDED.payload,version=1,expires_at=EXCLUDED.expires_at,updated_at=now() WHERE runtime_records.expires_at<=now() AND runtime_records.kind<>'audit' RETURNING id,version,payload AS value",
              [tenantId, kind, id, JSON.stringify(value), expiresAt ?? null],
            )
          : await client.query(
              "UPDATE runtime_records SET payload=$4,version=version+1,updated_at=now(),expires_at=COALESCE($6,expires_at) WHERE tenant_id=$1 AND kind=$2 AND id=$3 AND version=$5 AND (expires_at IS NULL OR expires_at>now()) RETURNING id,version,payload AS value",
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
  async putMany(tenantId: string, writes: RecordWrite[]): Promise<boolean> {
    try {
      return await this.scoped(tenantId, async (client) => {
        for (const write of writes) {
          const values = [
            tenantId,
            write.kind,
            write.id,
            JSON.stringify(write.value),
            write.expectedVersion,
            write.expiresAt ?? null,
          ];
          const result =
            write.expectedVersion === null
              ? await client.query(
                  "INSERT INTO runtime_records(tenant_id,kind,id,payload,expires_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT (tenant_id,kind,id) DO UPDATE SET payload=EXCLUDED.payload,version=1,expires_at=EXCLUDED.expires_at,updated_at=now() WHERE runtime_records.expires_at<=now() AND runtime_records.kind<>'audit' RETURNING id",
                  [
                    tenantId,
                    write.kind,
                    write.id,
                    JSON.stringify(write.value),
                    write.expiresAt ?? null,
                  ],
                )
              : await client.query(
                  "UPDATE runtime_records SET payload=$4,version=version+1,updated_at=now(),expires_at=COALESCE($6,expires_at) WHERE tenant_id=$1 AND kind=$2 AND id=$3 AND version=$5 AND (expires_at IS NULL OR expires_at>now()) RETURNING id",
                  values,
                );
          if (!result.rows.length) throw new BatchConflict();
        }
        return true;
      });
    } catch (error) {
      if (error instanceof BatchConflict) return false;
      throw error;
    }
  }
  async removeKind(tenantId: string, kind: string): Promise<number> {
    return this.scoped(
      tenantId,
      async (client) =>
        (
          await client.query("DELETE FROM runtime_records WHERE tenant_id=$1 AND kind=$2", [
            tenantId,
            kind,
          ])
        ).rowCount ?? 0,
    );
  }
  async purgeExpired(tenantId: string): Promise<number> {
    return this.scoped(
      tenantId,
      async (client) =>
        (
          await client.query(
            "DELETE FROM runtime_records WHERE tenant_id=$1 AND expires_at<=now() AND kind<>'audit'",
            [tenantId],
          )
        ).rowCount ?? 0,
    );
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
  async assertSafeRuntimeRole(tenantId: string) {
    await this.scoped(tenantId, async (client) => {
      const result = await client.query(
        "SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,(SELECT count(*)::integer FROM pg_class WHERE relname IN ('runtime_records','runtime_knowledge_chunks') AND relrowsecurity AND relforcerowsecurity) AS protected_tables,(SELECT count(*)::integer FROM pg_class WHERE relname IN ('runtime_records','runtime_knowledge_chunks') AND pg_has_role(relowner,'MEMBER')) AS owned_tables FROM pg_roles WHERE rolname=current_user",
      );
      const role = result.rows[0];
      if (
        !role ||
        role.rolsuper ||
        role.rolbypassrls ||
        role.rolcreaterole ||
        role.rolcreatedb ||
        role.owned_tables !== 0 ||
        role.protected_tables !== 2
      )
        throw new Error(
          "Runtime requires a restricted, non-owner NOBYPASSRLS role and both forced tenant policies",
        );
    });
  }
  async replaceKnowledgeChunks(
    tenantId: string,
    sourceId: string,
    version: number,
    chunks: IndexedKnowledgeChunk[],
  ) {
    await this.scoped(tenantId, async (client) => {
      await client.query(
        "DELETE FROM runtime_knowledge_chunks WHERE tenant_id=$1 AND source_id=$2 AND source_version=$3",
        [tenantId, sourceId, version],
      );
      for (const [ordinal, chunk] of chunks.entries())
        await client.query(
          "INSERT INTO runtime_knowledge_chunks(tenant_id,source_id,source_version,ordinal,content,embedding,embedding_model) VALUES($1,$2,$3,$4,$5,$6::vector,$7)",
          [
            tenantId,
            sourceId,
            version,
            ordinal,
            chunk.content,
            vectorParameter(chunk.embedding),
            chunk.model,
          ],
        );
    });
  }
  async searchKnowledge(
    tenantId: string,
    locationId: string,
    query: string,
    embedding: number[],
    model: string,
  ): Promise<KnowledgeExcerpt[]> {
    return this.scoped(
      tenantId,
      async (client) =>
        (
          await client.query(
            `
      SELECT c.source_id AS "sourceId",r.payload->>'title' AS title,c.content,c.source_version AS version,
        GREATEST(0,LEAST(1,1-(c.embedding <=> $4::vector)))*0.65
        + LEAST(1,ts_rank_cd(to_tsvector('simple',c.content),plainto_tsquery('simple',$3)))*0.25
        + CASE WHEN r.payload->>'kind' IN ('policy','forbidden_claim') THEN 0.1 ELSE 0 END AS score
      FROM runtime_knowledge_chunks c JOIN runtime_records r ON r.tenant_id=c.tenant_id AND r.id=c.source_id::text AND r.kind='knowledge'
      WHERE c.tenant_id=$1 AND c.embedding_model=$5 AND r.payload->>'status'='approved'
        AND (r.payload->>'version')::integer=c.source_version
        AND (r.payload->>'locationId' IS NULL OR r.payload->>'locationId'=$2)
        AND (r.payload->>'validFrom' IS NULL OR (r.payload->>'validFrom')::timestamptz<=now())
        AND (r.payload->>'validUntil' IS NULL OR (r.payload->>'validUntil')::timestamptz>now())
      ORDER BY CASE WHEN r.payload->>'kind' IN ('policy','forbidden_claim') THEN 0 ELSE 1 END,score DESC,c.source_id,c.ordinal LIMIT 12`,
            [tenantId, locationId, query, vectorParameter(embedding), model],
          )
        ).rows,
    );
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
    const stored = this.entries.get(key);
    const current =
      stored?.expiresAt && Date.parse(stored.expiresAt) <= Date.now() ? undefined : stored;
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
  async putMany(tenantId: string, writes: RecordWrite[]): Promise<boolean> {
    for (const write of writes) {
      const stored = this.entries.get(this.key(tenantId, write.kind, write.id));
      const entry =
        stored?.expiresAt && Date.parse(stored.expiresAt) <= Date.now() ? undefined : stored;
      if (
        write.expectedVersion === null ? Boolean(entry) : entry?.version !== write.expectedVersion
      )
        return false;
    }
    // No await in the commit loop: the in-memory adapter commits all writes in one turn.
    for (const write of writes) {
      const key = this.key(tenantId, write.kind, write.id);
      this.entries.set(key, {
        id: write.id,
        version: (write.expectedVersion ?? 0) + 1,
        value: structuredClone(write.value),
        expiresAt: write.expiresAt ?? this.entries.get(key)?.expiresAt,
      });
    }
    return true;
  }
  async removeKind(tenantId: string, kind: string): Promise<number> {
    let count = 0;
    for (const key of this.entries.keys())
      if (key.startsWith(`${tenantId}/${kind}/`)) {
        this.entries.delete(key);
        count++;
      }
    return count;
  }
  async purgeExpired(tenantId: string): Promise<number> {
    let count = 0;
    for (const [key, entry] of this.entries)
      if (
        key.startsWith(`${tenantId}/`) &&
        entry.expiresAt &&
        Date.parse(entry.expiresAt) <= Date.now()
      ) {
        this.entries.delete(key);
        count++;
      }
    return count;
  }
  async close(): Promise<void> {}
  async replaceKnowledgeChunks(): Promise<void> {}
  async searchKnowledge(): Promise<KnowledgeExcerpt[]> {
    throw new Error("Hybrid retrieval requires PostgreSQL; use the explicit demo retriever");
  }
}
class BatchConflict extends Error {}
