import type { RequestPrincipal, ReviewSnapshot } from "@reviewguard/contracts";
import {
  FakeGoogleBusinessClient,
  MockReplyProvider,
  type ReplyModelProvider,
} from "@reviewguard/core";
import { describe, expect, it } from "vitest";
import { DEMO_TENANT_ID, DEMO_USER_ID } from "../src/demo.js";
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
  return new ReviewService(
    store,
    ai,
    google,
    new ReviewNotificationService(store),
    new PublishTaskScheduler(),
  );
}

describe("ReviewService failure recovery", () => {
  it("moves failed draft generation to needs_attention", async () => {
    const store = new MemoryStore();
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

    expect(store.getReview(principal.tenantId, "55555555-5555-4555-8555-555555555552").status).toBe(
      "needs_attention",
    );
    expect(store.listAudit(principal.tenantId)[0]?.action).toBe("draft.generation_failed");
  });

  it("moves failed publication to needs_attention", async () => {
    class FailingGoogleClient extends FakeGoogleBusinessClient {
      override async getReview(_accessToken: string, _reviewName: string): Promise<ReviewSnapshot> {
        throw new Error("google unavailable");
      }
    }

    const store = new MemoryStore();
    const service = createService(store, new MockReplyProvider(), new FailingGoogleClient());

    await expect(
      service.approve(principal, "55555555-5555-4555-8555-555555555551", 3),
    ).rejects.toThrow("google unavailable");

    expect(store.getReview(principal.tenantId, "55555555-5555-4555-8555-555555555551").status).toBe(
      "needs_attention",
    );
    expect(store.listAudit(principal.tenantId)[0]?.action).toBe("reply.publish_failed");
  });
});
