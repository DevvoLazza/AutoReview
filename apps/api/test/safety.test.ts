import { FakeGoogleBusinessClient, type ReplyModelProvider } from "@reviewguard/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertStartupConfiguration } from "../src/config.js";
import { createApp } from "../src/main.js";
import { AI_PROVIDER, GOOGLE_GATEWAY } from "../src/providers.js";
import { TokenVault } from "../src/token-vault.js";

describe("Production configuration and token vault", () => {
  it("refuses demo configuration in production", () => {
    expect(() => assertStartupConfiguration({ NODE_ENV: "production" })).toThrow("AUTH_MODE");
  });
  it("authenticates encrypted token data and its tenant", () => {
    const vault = new TokenVault(Buffer.alloc(32, 1).toString("base64"));
    const encrypted = vault.seal({ refreshToken: "never-plain" }, "tenant-a");
    expect(encrypted).not.toContain("never-plain");
    expect(vault.open(encrypted, "tenant-a")).toEqual({ refreshToken: "never-plain" });
    expect(() => vault.open(encrypted, "tenant-b")).toThrow();
  });
});
describe("API workflow safety", () => {
  let app: Awaited<ReturnType<typeof createApp>>;
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_MODE = "demo";
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
  });
  const id = "55555555-5555-4555-8555-555555555551";
  it("does not expose another tenant's review", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/v1/reviews/${id}`,
      headers: { "x-tenant-id": "99999999-9999-4999-8999-999999999999" },
    });
    expect(response.statusCode).toBe(404);
  });
  it("requires MFA before publishing", async () => {
    const response = await app.inject({
      method: "POST",
      url: `/v1/reviews/${id}/approve`,
      headers: { "x-mfa-verified": "false" },
      payload: { expectedVersion: 3 },
    });
    expect(response.statusCode).toBe(403);
  });
  it("rejects stale edits atomically", async () => {
    const first = await app.inject({
      method: "POST",
      url: `/v1/reviews/${id}/edit`,
      payload: { expectedVersion: 3, text: "An approved manual response" },
    });
    expect(first.statusCode).toBe(201);
    const stale = await app.inject({
      method: "POST",
      url: `/v1/reviews/${id}/edit`,
      payload: { expectedVersion: 3, text: "Must not overwrite" },
    });
    expect(stale.statusCode).toBe(409);
  });
  it("releases failed Pub/Sub events and retries generation safely", async () => {
    const google = app.get<FakeGoogleBusinessClient>(GOOGLE_GATEWAY);
    const name = "accounts/demo/locations/demo-location/reviews/retry-test";
    google.putReview({
      googleReviewName: name,
      locationId: "demo-location",
      reviewerDisplayName: "Test",
      starRating: 5,
      comment: "A positive visit",
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
      existingReply: null,
    });
    const envelope = {
      message: {
        messageId: "retry-test",
        publishTime: new Date().toISOString(),
        data: Buffer.from(
          JSON.stringify({
            notificationType: "NEW_REVIEW",
            reviewName: name,
            locationName: "locations/demo-location",
          }),
        ).toString("base64"),
      },
    };
    const ai = app.get<ReplyModelProvider>(AI_PROVIDER);
    const spy = vi.spyOn(ai, "generateDraft").mockRejectedValueOnce(new Error("Transport failed"));
    const first = await app.inject({
      method: "POST",
      url: "/v1/webhooks/google-business",
      headers: { "x-reviewguard-worker-secret": "reviewguard-local-worker-secret" },
      payload: envelope,
    });
    expect(first.statusCode).toBe(500);
    const second = await app.inject({
      method: "POST",
      url: "/v1/webhooks/google-business",
      headers: { "x-reviewguard-worker-secret": "reviewguard-local-worker-secret" },
      payload: envelope,
    });
    expect(second.statusCode).toBe(201);
    const duplicate = await app.inject({
      method: "POST",
      url: "/v1/webhooks/google-business",
      headers: { "x-reviewguard-worker-secret": "reviewguard-local-worker-secret" },
      payload: envelope,
    });
    expect(duplicate.json().duplicate).toBe(true);
    spy.mockRestore();
  });
});
