import { FakeGoogleBusinessClient } from "@reviewguard/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_TENANT_ID } from "../src/demo.js";
import { createApp } from "../src/main.js";
import { GOOGLE_GATEWAY } from "../src/providers.js";
import { MemoryStore } from "../src/store.js";

describe("Publication recovery and canonical review checks", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let google: FakeGoogleBusinessClient;
  let store: MemoryStore;
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_MODE = "demo";
    app = await createApp();
    google = app.get(GOOGLE_GATEWAY);
    store = app.get(MemoryStore);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });
  const id = "55555555-5555-4555-8555-555555555551";
  const approve = (expectedVersion: number) =>
    app.inject({
      method: "POST",
      url: `/v1/reviews/${id}/approve`,
      payload: { expectedVersion },
    });

  it("reconciles a successful PUT with a lost response without publishing twice", async () => {
    const original = google.updateReply.bind(google);
    const put = vi.spyOn(google, "updateReply").mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error("Connection lost after Google accepted the reply");
    });
    expect((await approve(3)).statusCode).toBe(500);
    expect((await store.getReview(DEMO_TENANT_ID, id)).status).toBe("publishing");
    expect((await approve(3)).statusCode).toBe(503);
    const intent = await store.repository.get<{ startedAt: number }>(DEMO_TENANT_ID, "publish", id);
    expect(intent).not.toBeNull();
    if (!intent) throw new Error("Missing publish intent");
    await store.repository.put(
      DEMO_TENANT_ID,
      "publish",
      id,
      { ...intent.value, startedAt: Date.now() - 121_000 },
      intent.version,
    );
    const reconciled = await approve(3);
    expect(reconciled.statusCode).toBe(201);
    expect(reconciled.json().status).toBe("published");
    expect((await approve(3)).json().status).toBe("published");
    expect(put).toHaveBeenCalledTimes(1);
    put.mockRestore();
  });

  it("keeps the confirmed publication on its own Google update event", async () => {
    const current = await store.getReview(DEMO_TENANT_ID, id);
    const snapshot = await google.getReview("demo", current.snapshot.googleReviewName);
    const updated = await store.createReview(
      DEMO_TENANT_ID,
      {
        ...snapshot,
        locationId: current.snapshot.locationId,
        updateTime: new Date().toISOString(),
      },
      true,
    );
    expect(updated.status).toBe("published");
  });

  it("invalidates a draft when Google changes the review before publication", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/google-business/demo",
      payload: {},
    });
    const review = response.json();
    google.putReview({
      ...review.snapshot,
      comment: "Changed since generation",
      updateTime: new Date(Date.now() + 1000).toISOString(),
    });
    const put = vi.spyOn(google, "updateReply");
    const result = await app.inject({
      method: "POST",
      url: `/v1/reviews/${review.id}/approve`,
      payload: { expectedVersion: review.version },
    });
    expect(result.json().status).toBe("needs_attention");
    expect(result.json().activeDraft).toBeNull();
    expect(put).not.toHaveBeenCalled();
    put.mockRestore();
  });

  it("only one concurrent approver reaches Google PUT", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/google-business/demo",
      payload: {},
    });
    const review = response.json();
    const put = vi.spyOn(google, "updateReply");
    const results = await Promise.all(
      [1, 2].map(() =>
        app.inject({
          method: "POST",
          url: `/v1/reviews/${review.id}/approve`,
          payload: { expectedVersion: review.version },
        }),
      ),
    );
    expect(results.filter((r) => r.json().status === "published").length).toBeGreaterThan(0);
    expect(put).toHaveBeenCalledTimes(1);
    expect((await store.getReview(DEMO_TENANT_ID, review.id)).status).toBe("published");
    put.mockRestore();
  });

  it("marks previously edited reviews as a non-disableable hard stop", async () => {
    const created = new Date(Date.now() - 60_000).toISOString();
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/google-business/demo",
      payload: {
        googleReviewName: `accounts/demo/locations/demo/reviews/${crypto.randomUUID()}`,
        locationId: "demo-location",
        reviewerDisplayName: "Test",
        starRating: 5,
        comment: "Great visit",
        createTime: created,
        updateTime: new Date().toISOString(),
        existingReply: null,
      },
    });
    expect(response.json().activeDraft.riskFlags).toContain("review_updated");
    expect(response.json().status).toBe("pending_approval");
  });
});
