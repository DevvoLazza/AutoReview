import type { RequestPrincipal, ReviewSnapshot } from "@reviewguard/contracts";
import {
  FakeGoogleBusinessClient,
  MockReplyProvider,
  type ReplyModelProvider,
} from "@reviewguard/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_SNAPSHOTS, DEMO_TENANT_ID, DEMO_USER_ID } from "../src/demo.js";
import { KnowledgeService } from "../src/knowledge.service.js";
import { ReviewNotificationService } from "../src/notifications.js";
import { ReviewService } from "../src/review.service.js";
import { MemoryStore } from "../src/store.js";
import { PublishTaskScheduler } from "../src/tasks.js";

const principal: RequestPrincipal = {
  tenantId: DEMO_TENANT_ID,
  userId: DEMO_USER_ID,
  role: "owner",
  mfaVerified: true,
};

function createService(
  store: MemoryStore,
  ai: ReplyModelProvider,
  google: FakeGoogleBusinessClient,
): ReviewService {
  for (const snapshot of DEMO_SNAPSHOTS) google.putReview(snapshot);
  return new ReviewService(
    store,
    ai,
    google,
    new ReviewNotificationService(store),
    new PublishTaskScheduler(),
    new KnowledgeService(store),
  );
}

async function createStore() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("AUTH_MODE", "demo");
  vi.stubEnv("STORAGE_MODE", "memory");
  vi.stubEnv("EMBEDDING_MODE", "demo");
  const store = new MemoryStore();
  await store.onModuleInit();
  return store;
}

describe("ReviewService failure recovery", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("moves failed draft generation to needs_attention", async () => {
    const store = await createStore();
    const failingAi: ReplyModelProvider = {
      generateDraft: async () => {
        throw new Error("provider unavailable");
      },
      validateDraft: async () => {
        throw new Error("provider unavailable");
      },
    };
    const service = createService(store, failingAi, new FakeGoogleBusinessClient());

    await expect(
      service.generate(principal, "55555555-5555-4555-8555-555555555552", 1),
    ).rejects.toThrow("provider unavailable");

    expect(
      (await store.getReview(principal.tenantId, "55555555-5555-4555-8555-555555555552")).status,
    ).toBe("needs_attention");
    expect(await store.listAudit(principal.tenantId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "draft.generation_failed" })]),
    );
    const recovered = await createService(
      store,
      new MockReplyProvider(),
      new FakeGoogleBusinessClient(),
    ).generate(principal, "55555555-5555-4555-8555-555555555552", 3);
    expect(recovered.status).toBe("pending_approval");
    await store.onModuleDestroy();
  });

  it("recovers a failed preflight without an uncertain Google write", async () => {
    class FailingGoogleClient extends FakeGoogleBusinessClient {
      override async getReview(_accessToken: string, _reviewName: string): Promise<ReviewSnapshot> {
        throw new Error("google unavailable");
      }
    }

    const store = await createStore();
    const service = createService(store, new MockReplyProvider(), new FailingGoogleClient());

    await expect(
      service.approve(principal, "55555555-5555-4555-8555-555555555551", 3),
    ).rejects.toThrow("google unavailable");

    expect(
      (await store.getReview(principal.tenantId, "55555555-5555-4555-8555-555555555551")).status,
    ).toBe("needs_attention");
    expect(await store.listAudit(principal.tenantId)).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "reply.publish_failed" })]),
    );
    const recovered = await createService(
      store,
      new MockReplyProvider(),
      new FakeGoogleBusinessClient(),
    ).approve(principal, "55555555-5555-4555-8555-555555555551", 5);
    expect(recovered.status).toBe("published");
    await store.onModuleDestroy();
  });
});
