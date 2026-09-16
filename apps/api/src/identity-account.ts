import { Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";

const accountSchema = z.object({
  disabled: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  validSince: z.string().optional(),
  customAttributes: z.string().optional(),
});
export function assertCurrentIdentityAccount(
  account: unknown,
  claims: { auth_time?: unknown; tenant_id: string; app_user_id: string; role: string },
) {
  const value = accountSchema.parse(account);
  const attributes = JSON.parse(value.customAttributes ?? "{}");
  if (
    value.disabled ||
    !value.emailVerified ||
    typeof claims.auth_time !== "number" ||
    claims.auth_time < Number(value.validSince ?? 0) ||
    attributes.tenant_id !== claims.tenant_id ||
    attributes.app_user_id !== claims.app_user_id ||
    attributes.role !== claims.role
  )
    throw new UnauthorizedException("Account or permissions changed: sign in again");
}
@Injectable()
export class IdentityAccountVerifier {
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  async verify(uid: string, claims: Parameters<typeof assertCurrentIdentityAccount>[1]) {
    let account: unknown;
    try {
      const result = await this.auth.request<{ users?: unknown[] }>({
        url: `https://identitytoolkit.googleapis.com/v1/projects/${process.env.IDENTITY_PROJECT_ID}/accounts:lookup`,
        method: "POST",
        data: { localId: [uid] },
        timeout: 5_000,
        retry: false,
      });
      account = result.data.users?.[0];
    } catch {
      throw new ServiceUnavailableException("Account verification is temporarily unavailable");
    }
    if (!account) throw new UnauthorizedException("Account is no longer authorized");
    try {
      assertCurrentIdentityAccount(account, claims);
    } catch {
      throw new UnauthorizedException("Account or permissions changed: sign in again");
    }
  }
}
