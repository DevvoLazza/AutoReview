import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  getItemAsync: async () => storage.value,
  setItemAsync: async (_key: string, value: string) => {
    storage.value = value;
  },
  deleteItemAsync: async () => {
    storage.value = null;
  },
}));

describe("Native session lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    storage.value = null;
    vi.stubGlobal("__DEV__", false);
    vi.stubEnv("EXPO_PUBLIC_IDENTITY_API_KEY", "test-project-key");
    vi.stubEnv("EXPO_PUBLIC_AUTH_MODE", "identity");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const expired = { idToken: "expired", refreshToken: "refresh", expiresAt: 0 };
  const response = () =>
    Response.json({ id_token: "fresh", refresh_token: "new-refresh", expires_in: "3600" });
  it("restores a valid session without a network request", async () => {
    const session = await import("../src/lib/session");
    storage.value = JSON.stringify({
      ...expired,
      idToken: "current",
      expiresAt: Date.now() + 3_600_000,
    });
    const transport = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", transport);
    expect(await session.accessToken()).toBe("current");
    expect(transport).not.toHaveBeenCalled();
  });
  it("deduplicates concurrent refresh requests", async () => {
    const session = await import("../src/lib/session");
    await session.saveSession(expired);
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => response());
    vi.stubGlobal("fetch", transport);
    expect(await Promise.all([session.accessToken(), session.accessToken()])).toEqual([
      "fresh",
      "fresh",
    ]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.value ?? "{}").refreshToken).toBe("new-refresh");
  });
  it("cannot restore a session after logout while refresh is pending", async () => {
    const session = await import("../src/lib/session");
    await session.saveSession(expired);
    let finish: ((value: Response) => void) | undefined;
    const started = Promise.withResolvers<void>();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation(() => {
        started.resolve();
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const pending = session.accessToken();
    await started.promise;
    await session.signOut();
    if (!finish) throw new Error("Refresh was not started");
    finish(response());
    expect(await pending).toBeNull();
    expect(await session.accessToken()).toBeNull();
    expect(storage.value).toBeNull();
  });
  it("clears a revoked or failed refresh instead of retaining stale credentials", async () => {
    const session = await import("../src/lib/session");
    await session.saveSession(expired);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 401 })),
    );
    await expect(session.accessToken()).rejects.toThrow("Sessione scaduta");
    expect(storage.value).toBeNull();
    expect(await session.accessToken()).toBeNull();
  });
  it("refuses demo authentication outside development builds", async () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_MODE", "demo");
    expect((await import("../src/lib/session")).demoMode).toBe(false);
  });
});
