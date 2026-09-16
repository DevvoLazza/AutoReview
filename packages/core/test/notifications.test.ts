import { describe, expect, it, vi } from "vitest";
import { ExpoNotificationGateway, type PushMessage } from "../src/notifications/gateway.js";

const message: PushMessage = {
  userIds: ["user"],
  title: "Approval needed",
  body: "Open the authenticated inbox",
  route: "/reviews/id",
  category: "approval_required",
};
describe("Expo submission", () => {
  it("batches at most 100 tokens and keeps review content out of push payloads", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const batch = JSON.parse(String(init?.body));
      expect(batch.length).toBeLessThanOrEqual(100);
      expect(batch[0].data).toEqual({ route: message.route, category: message.category });
      return Response.json({ data: batch.map(() => ({ status: "ok" })) });
    });
    await new ExpoNotificationGateway(
      async () => Array.from({ length: 201 }, (_, id) => `token-${id}`),
      fetchImpl,
    ).send(message);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it("does not treat HTTP 200 error tickets as success", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [{ status: "error", details: { error: "MessageRateExceeded" } }] }),
      );
    await expect(
      new ExpoNotificationGateway(async () => ["token"], fetchImpl).send(message),
    ).rejects.toThrow("retry required");
  });
  it("removes unregistered devices without retrying them", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }),
      );
    await new ExpoNotificationGateway(async () => ["invalid"], fetchImpl, remove).send(message);
    expect(remove).toHaveBeenCalledWith("invalid");
  });
});
