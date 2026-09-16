import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresRecordRepository } from "../src/records.js";

describe("Embedded PostgreSQL runtime migration and repository", () => {
  let database: PGlite;
  let repository: PostgresRecordRepository;
  const tenant = "11111111-1111-4111-8111-111111111111";
  beforeAll(async () => {
    database = new PGlite({ extensions: { vector } });
    await database.exec("CREATE EXTENSION vector");
    await database.exec(
      "CREATE FUNCTION app_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.tenant_id',true),'')::uuid $$;",
    );
    await database.exec(
      await readFile(new URL("../migrations/0003_runtime_records.sql", import.meta.url), "utf8"),
    );
    await database.exec(
      await readFile(
        new URL("../migrations/0004_runtime_knowledge_chunks.sql", import.meta.url),
        "utf8",
      ),
    );
    await database.exec(
      "CREATE ROLE runtime_user NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO runtime_user; GRANT SELECT,INSERT,UPDATE,DELETE ON runtime_records,runtime_knowledge_chunks TO runtime_user; SET ROLE runtime_user;",
    );
    let queue = Promise.resolve();
    const pool = {
      connect: async () => {
        const previous = queue;
        let unlock = () => {};
        queue = new Promise<void>((resolve) => {
          unlock = resolve;
        });
        await previous;
        return {
          query: (sql: string, values?: unknown[]) => database.query(sql, values),
          release: unlock,
        };
      },
      end: async () => {},
    };
    repository = new PostgresRecordRepository("embedded", pool as unknown as Pool);
  }, 30_000);
  afterAll(async () => {
    await database.close();
  });
  it("persists and compares versions using the production SQL", async () => {
    expect(
      (await repository.put(tenant, "settings", "one", { name: "original" }, null))?.version,
    ).toBe(1);
    const results = await Promise.all([
      repository.put(tenant, "settings", "one", { name: "A" }, 1),
      repository.put(tenant, "settings", "one", { name: "B" }, 1),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await repository.get(tenant, "settings", "one"))?.version).toBe(2);
  });
  it("resets tenant scope between pooled requests", async () => {
    const other = "99999999-9999-4999-8999-999999999999";
    expect(await repository.get(other, "settings", "one")).toBeNull();
    expect(await repository.list(other, "settings")).toEqual([]);
    expect((await repository.get(tenant, "settings", "one"))?.version).toBe(2);
  });
  it("enforces RLS even if a query omits the tenant predicate", async () => {
    await database.exec("BEGIN");
    await database.query("SELECT set_config('app.tenant_id',$1,true)", [
      "99999999-9999-4999-8999-999999999999",
    ]);
    expect((await database.query("SELECT * FROM runtime_records")).rows).toEqual([]);
    await database.exec("ROLLBACK");
  });
  it("keeps audit append-only", async () => {
    await repository.put(tenant, "audit", "audit-one", { action: "test" }, null);
    await expect(repository.put(tenant, "audit", "audit-one", {}, 1)).rejects.toThrow(
      "append-only",
    );
    await expect(repository.remove(tenant, "audit", "audit-one")).rejects.toThrow("append-only");
    expect((await repository.get(tenant, "audit", "audit-one"))?.value).toEqual({ action: "test" });
  });
  it("hides expired snapshots", async () => {
    await repository.put(
      tenant,
      "review",
      "expired",
      { snapshot: { googleReviewName: "accounts/demo/locations/one/reviews/expired" } },
      null,
      "2020-01-01T00:00:00.000Z",
    );
    expect(await repository.get(tenant, "review", "expired")).toBeNull();
  });
  it("atomically commits the workflow and publication intent, rolling both back on conflict", async () => {
    await repository.put(tenant, "review", "atomic", { status: "pending" }, null);
    expect(
      await repository.putMany(tenant, [
        { kind: "review", id: "atomic", value: { status: "publishing" }, expectedVersion: 1 },
        { kind: "publish", id: "atomic", value: { text: "approved" }, expectedVersion: 99 },
      ]),
    ).toBe(false);
    expect((await repository.get(tenant, "review", "atomic"))?.value).toEqual({
      status: "pending",
    });
    expect(
      await repository.putMany(tenant, [
        { kind: "review", id: "atomic", value: { status: "publishing" }, expectedVersion: 1 },
        { kind: "publish", id: "atomic", value: { text: "approved" }, expectedVersion: null },
      ]),
    ).toBe(true);
    expect((await repository.get(tenant, "publish", "atomic"))?.value).toEqual({
      text: "approved",
    });
  });
  it("recreates expired records and physically purges expired content", async () => {
    expect(
      await repository.put(
        tenant,
        "review",
        "expired",
        { snapshot: { googleReviewName: "newly-fetched" } },
        null,
      ),
    ).not.toBeNull();
    await repository.put(
      tenant,
      "publish",
      "expired-intent",
      { text: "expired" },
      null,
      "2020-01-01T00:00:00.000Z",
    );
    expect(await repository.purgeExpired(tenant)).toBe(1);
    expect(await repository.removeKind(tenant, "publish")).toBe(1);
  });
  it("runs hybrid pgvector/full-text retrieval and excludes stale, retired and foreign sources", async () => {
    const sourceId = "44444444-4444-4444-8444-444444444441";
    const embedding = Array.from({ length: 768 }, (_, index) => (index === 0 ? 1 : 0));
    const source = {
      title: "Opening hours",
      version: 2,
      status: "approved",
      kind: "opening_hours",
      locationId: null,
      validFrom: null,
      validUntil: null,
    };
    await repository.put(tenant, "knowledge", sourceId, source, null);
    await repository.replaceKnowledgeChunks(tenant, sourceId, 2, [
      { content: "Opening hours: Monday to Friday", embedding, model: "test-model" },
    ]);
    expect(
      (await repository.searchKnowledge(tenant, "one", "opening hours", embedding, "test-model"))[0]
        ?.sourceId,
    ).toBe(sourceId);
    expect(
      await repository.searchKnowledge(
        "99999999-9999-4999-8999-999999999999",
        "one",
        "opening hours",
        embedding,
        "test-model",
      ),
    ).toEqual([]);
    await repository.put(tenant, "knowledge", sourceId, { ...source, version: 3 }, 1);
    expect(
      await repository.searchKnowledge(tenant, "one", "opening hours", embedding, "test-model"),
    ).toEqual([]);
    await repository.replaceKnowledgeChunks(tenant, sourceId, 3, [
      { content: "Opening hours", embedding, model: "test-model" },
    ]);
    await repository.put(
      tenant,
      "knowledge",
      sourceId,
      { ...source, version: 3, status: "retired" },
      2,
    );
    expect(
      await repository.searchKnowledge(tenant, "one", "opening hours", embedding, "test-model"),
    ).toEqual([]);
  });
});
