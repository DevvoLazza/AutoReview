import { describe, expect, it } from "vitest";
import { MemoryRecordRepository, PostgresRecordRepository } from "../src/records.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "99999999-9999-4999-8999-999999999999";
describe("Versioned record repository", () => {
  it("isolates tenants with identical record ids", async () => {
    const store = new MemoryRecordRepository();
    await store.put(tenantA, "settings", "business", { name: "A" }, null);
    expect(await store.get(tenantB, "settings", "business")).toBeNull();
    expect(await store.list(tenantB, "settings")).toEqual([]);
  });
  it("only one concurrent writer can replace a version", async () => {
    const store = new MemoryRecordRepository();
    await store.put(tenantA, "review", "id", { text: "original" }, null);
    const results = await Promise.all([
      store.put(tenantA, "review", "id", { text: "one" }, 1),
      store.put(tenantA, "review", "id", { text: "two" }, 1),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await store.put(tenantA, "review", "id", {}, null)).toBeNull();
  });
  it("hides expired Google payloads", async () => {
    const store = new MemoryRecordRepository();
    await store.put(tenantA, "review", "id", { text: "expired" }, null, "2020-01-01T00:00:00.000Z");
    expect(await store.get(tenantA, "review", "id")).toBeNull();
    expect(await store.list(tenantA, "review")).toEqual([]);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "PostgreSQL integration (migrations and non-superuser runtime role required)",
  () => {
    it("persists across connections and uses transactional compare-and-swap", async () => {
      const url = process.env.TEST_DATABASE_URL;
      if (!url) throw new Error("TEST_DATABASE_URL is required");
      const one = new PostgresRecordRepository(url);
      const two = new PostgresRecordRepository(url);
      const id = crypto.randomUUID();
      try {
        await one.put(tenantA, "settings", id, { name: "persisted" }, null);
        expect((await two.get<{ name: string }>(tenantA, "settings", id))?.value.name).toBe(
          "persisted",
        );
        expect(await two.get(tenantB, "settings", id)).toBeNull();
        const results = await Promise.all([
          one.put(tenantA, "settings", id, {}, 1),
          two.put(tenantA, "settings", id, {}, 1),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
      } finally {
        await one.remove(tenantA, "settings", id);
        await one.close();
        await two.close();
      }
    });
  },
);
