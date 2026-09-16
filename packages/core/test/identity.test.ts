import { describe, expect, it, vi } from "vitest";
import { IdentityClient } from "../src/auth/identity.js";

describe("Identity Platform session client", () => {
  it("does not treat a pending MFA challenge as a session", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          mfaPendingCredential: "pending",
          mfaInfo: [{ mfaEnrollmentId: "factor", totpInfo: {} }],
        }),
      ),
    );
    const result = await new IdentityClient("public-key", request).signIn(
      "owner@example.com",
      "password",
    );
    expect(result).toEqual({
      challenge: { mfaPendingCredential: "pending", mfaEnrollmentId: "factor" },
    });
  });
  it("finalizes TOTP using the official v2 contract", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ idToken: "id", refreshToken: "refresh" })));
    const result = await new IdentityClient("key", request).verifyMfa(
      { mfaPendingCredential: "pending", mfaEnrollmentId: "factor" },
      "123456",
    );
    expect(result.idToken).toBe("id");
    expect(request.mock.calls[0]?.[0]).toContain("v2/accounts/mfaSignIn:finalize");
    expect(JSON.parse(request.mock.calls[0]?.[1].body)).toMatchObject({
      totpVerificationInfo: { verificationCode: "123456" },
    });
  });
  it("redacts provider error payloads", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: "INVALID_LOGIN_CREDENTIALS : sensitive@example.com" },
        }),
        { status: 400 },
      ),
    );
    await expect(new IdentityClient("key", request).signIn("a@b.it", "password")).rejects.toThrow(
      "Email o password non corretti",
    );
  });
});
