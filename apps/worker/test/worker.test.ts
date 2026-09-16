import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorker } from "../src/main.js";

const notification = {
  notificationType: "NEW_REVIEW",
  reviewName: "accounts/1/locations/2/reviews/3",
  locationName: "locations/2",
};

describe("Google event worker", () => {
  afterEach(() => vi.restoreAllMocks());

  it("delegates every valid redelivery to the durable API lease", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ accepted: true }), { status: 200 }),
    );
    const worker = createWorker({ fetchImpl: fetchImpl as typeof fetch });
    const payload = {
      message: {
        messageId: "message-1",
        data: Buffer.from(JSON.stringify(notification)).toString("base64"),
      },
    };
    const first = await worker.inject({ method: "POST", url: "/events/google-business", payload });
    const duplicate = await worker.inject({
      method: "POST",
      url: "/events/google-business",
      payload,
    });
    expect(first.statusCode).toBe(204);
    expect(duplicate.statusCode).toBe(204);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await worker.close();
  });

  it("rejects malformed event bodies", async () => {
    const worker = createWorker({ fetchImpl: vi.fn() as unknown as typeof fetch });
    const response = await worker.inject({
      method: "POST",
      url: "/events/google-business",
      payload: { message: { messageId: "message-2", data: "not-base64-json" } },
    });
    expect(response.statusCode).toBe(400);
    await worker.close();
  });
});
