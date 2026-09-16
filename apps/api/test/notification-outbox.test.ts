import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_TENANT_ID, DEMO_USER_ID } from "../src/demo.js";
import { createApp } from "../src/main.js";
import { ReviewNotificationService } from "../src/notifications.js";
import { MemoryStore } from "../src/store.js";

describe("Durable push retries", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  let store: MemoryStore;
  let notifications: ReviewNotificationService;
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_MODE = "demo";
    app = await createApp();
    store = app.get(MemoryStore);
    notifications = app.get(ReviewNotificationService);
    await store.registerDevice(
      { tenantId: DEMO_TENANT_ID, userId: DEMO_USER_ID, role: "owner", mfaVerified: true },
      { token: "ExpoPushToken[local-test]", platform: "android", provider: "expo" },
    );
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });
  it("keeps a failed submission and retries it once due", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("Temporary Expo failure"))
      .mockResolvedValue(Response.json({ data: [{ status: "ok", id: "ticket" }] }));
    vi.stubGlobal("fetch", transport);
    const review = await store.getReview(DEMO_TENANT_ID, "55555555-5555-4555-8555-555555555551");
    await expect(
      notifications.reviewReady(
        { tenantId: DEMO_TENANT_ID, userId: DEMO_USER_ID, role: "owner", mfaVerified: true },
        review,
      ),
    ).rejects.toThrow();
    const id = `push/${review.id}/${review.version}`;
    const record = await store.repository.get<Record<string, unknown>>(DEMO_TENANT_ID, "event", id);
    if (!record) throw new Error("Expected pending push");
    await store.repository.put(
      DEMO_TENANT_ID,
      "event",
      id,
      { ...record.value, nextAttemptAt: 0 },
      record.version,
    );
    expect((await notifications.retryPending(DEMO_TENANT_ID)).submitted).toBe(1);
    expect(await store.repository.get(DEMO_TENANT_ID, "event", id)).toBeNull();
    expect(transport).toHaveBeenCalledTimes(2);
    expect((await notifications.retryPending(DEMO_TENANT_ID)).processed).toBe(0);
  });
});
