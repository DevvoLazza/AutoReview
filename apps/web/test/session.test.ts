import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkOrigin, clearSession, currentToken, readSession, writeSession } from "../lib/session";

const jar = vi.hoisted(() => ({ value: null as string | null, writes: 0 }));
function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("Deferred promise not ready");
  };
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (jar.value ? { value: jar.value } : undefined),
    set: (_name: string, value: string) => {
      jar.value = value;
      jar.writes++;
    },
    delete: () => {
      jar.value = null;
    },
  }),
}));

describe("Server-held browser session", () => {
  beforeEach(() => {
    jar.value = null;
    jar.writes = 0;
    vi.stubEnv("AUTH_COOKIE_SECRET", Buffer.alloc(32, 1).toString("base64"));
    vi.stubEnv("IDENTITY_API_KEY", "test-project-key");
    vi.stubEnv("WEB_ORIGIN", "https://app.example.com");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const session = {
    idToken: "private-identity-token",
    refreshToken: "private-refresh-token",
    expiresAt: 0,
  };
  it("round-trips an encrypted cookie without exposing credential strings", async () => {
    await writeSession(session);
    expect(jar.value).not.toContain(session.idToken);
    expect(jar.value).not.toContain(session.refreshToken);
    expect(await readSession()).toEqual(session);
  });
  it("rejects a cookie encrypted under another key", async () => {
    await writeSession(session);
    vi.stubEnv("AUTH_COOKIE_SECRET", Buffer.alloc(32, 2).toString("base64"));
    expect(await readSession()).toBeNull();
  });
  it("checks configured browser origin even behind a reverse proxy", () => {
    expect(() =>
      checkOrigin(
        new Request("https://internal.run.app/api/session", {
          method: "POST",
          headers: { Origin: "https://app.example.com" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      checkOrigin(
        new Request("https://internal.run.app/api/session", {
          method: "POST",
          headers: { Origin: "https://attacker.example" },
        }),
      ),
    ).toThrow("origin");
  });
  it("does not recreate a cookie after logout during an in-flight refresh", async () => {
    await writeSession(session);
    const response = deferred<Response>();
    const started = deferred<void>();
    const transport = vi.fn<typeof fetch>().mockImplementation(() => {
      started.resolve();
      return response.promise;
    });
    vi.stubGlobal("fetch", transport);
    const tokens = Promise.all([currentToken(), currentToken()]);
    await started.promise;
    await clearSession();
    response.resolve(
      Response.json({ id_token: "fresh", refresh_token: "renewed", expires_in: "3600" }),
    );
    expect(await tokens).toEqual(["fresh", "fresh"]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(jar.value).toBeNull();
    expect(jar.writes).toBe(1);
  });
});
