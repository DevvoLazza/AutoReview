import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/main.js";

describe("ReviewGuard API", () => {
  let app: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.AUTH_MODE = "demo";
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports health", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
  });

  it("lists the isolated demo inbox", async () => {
    const response = await app.inject({ method: "GET", url: "/v1/reviews" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(3);
  });

  it("applies review list filters and limits", async () => {
    const limited = await app.inject({ method: "GET", url: "/v1/reviews?limit=1" });
    const missingLocation = await app.inject({
      method: "GET",
      url: "/v1/reviews?locationId=missing-location",
    });

    expect(limited.statusCode).toBe(200);
    expect(limited.json().data).toHaveLength(1);
    expect(missingLocation.statusCode).toBe(200);
    expect(missingLocation.json().data).toHaveLength(0);
  });

  it("rejects stale approvals", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/reviews/55555555-5555-4555-8555-555555555551/approve",
      payload: { expectedVersion: 99 },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("version_conflict");
  });
  it("paginates the inbox without dropping or repeating reviews", async () => {
    const first = (await app.inject({ method: "GET", url: "/v1/reviews?limit=2" })).json();
    expect(first.data).toHaveLength(2);
    expect(first.meta.total).toBe(3);
    const second = (
      await app.inject({
        method: "GET",
        url: `/v1/reviews?limit=2&cursor=${first.meta.nextCursor}`,
      })
    ).json();
    expect(second.data).toHaveLength(1);
    expect(second.meta.nextCursor).toBeNull();
    expect(new Set([...first.data, ...second.data].map((entry) => entry.id)).size).toBe(3);
  });

  it("publishes an approved reply after the canonical Google re-read", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/reviews/55555555-5555-4555-8555-555555555551/approve",
      payload: { expectedVersion: 3 },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("published");
    expect(response.json().publishedReply).toContain("Grazie Giulia");
  });

  it("rejects unauthenticated calls from a fake worker", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/google-business",
      payload: { message: { messageId: "fake", data: "e30=" } },
    });
    expect(response.statusCode).toBe(401);
  });
});
