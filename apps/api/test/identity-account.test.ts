import { describe, expect, it } from "vitest";
import { assertCurrentIdentityAccount } from "../src/identity-account.js";

const claims = { auth_time: 200, tenant_id: "tenant", app_user_id: "user", role: "owner" };
const account = {
  emailVerified: true,
  validSince: "100",
  customAttributes: JSON.stringify(claims),
};
describe("Current Identity Platform account authorization", () => {
  it("accepts a verified account with matching current grants", () =>
    expect(() => assertCurrentIdentityAccount(account, claims)).not.toThrow());
  it("rejects revoked or disabled sessions", () => {
    expect(() => assertCurrentIdentityAccount({ ...account, validSince: "201" }, claims)).toThrow();
    expect(() => assertCurrentIdentityAccount({ ...account, disabled: true }, claims)).toThrow();
  });
  it("rejects stale role and tenant claims", () => {
    expect(() => assertCurrentIdentityAccount(account, { ...claims, role: "approver" })).toThrow();
    expect(() =>
      assertCurrentIdentityAccount(account, { ...claims, tenant_id: "other" }),
    ).toThrow();
  });
});
