import { parseArgs } from "node:util";
import { GoogleAuth } from "google-auth-library";

const { values } = parseArgs({
  options: {
    project: { type: "string" },
    uid: { type: "string" },
    tenant: { type: "string" },
    "user-id": { type: "string" },
    role: { type: "string" },
    apply: { type: "boolean", default: false },
  },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (
  !values.project ||
  !/^[a-z][a-z0-9-]{4,62}$/.test(values.project) ||
  !values.uid ||
  !uuid.test(values.tenant ?? "") ||
  !uuid.test(values["user-id"] ?? "") ||
  !["owner", "admin", "editor", "approver"].includes(values.role ?? "")
) {
  console.error(
    "Usage: pnpm identity:grant --project PROJECT --uid IDENTITY_UID --tenant UUID --user-id UUID --role owner|admin|editor|approver [--apply]",
  );
  process.exit(1);
}
const claims = { tenant_id: values.tenant, app_user_id: values["user-id"], role: values.role };
console.info(
  JSON.stringify(
    {
      dryRun: !values.apply,
      project: values.project,
      uid: values.uid,
      claims,
      action: "assign access and revoke existing sessions",
    },
    null,
    2,
  ),
);
if (values.apply) {
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const base = `https://identitytoolkit.googleapis.com/v1/projects/${values.project}/accounts`;
  try {
    const lookup = await auth.request({
      url: `${base}:lookup`,
      method: "POST",
      data: { localId: [values.uid] },
      timeout: 10_000,
      retry: false,
    });
    const account = lookup.data.users?.[0];
    if (!account) throw new Error("missing account");
    const current = JSON.parse(account.customAttributes ?? "{}");
    await auth.request({
      url: `${base}:update`,
      method: "POST",
      data: {
        localId: values.uid,
        customAttributes: JSON.stringify({ ...current, ...claims }),
        validSince: String(Math.floor(Date.now() / 1000)),
      },
      timeout: 10_000,
      retry: false,
    });
    const verified = await auth.request({
      url: `${base}:lookup`,
      method: "POST",
      data: { localId: [values.uid] },
      timeout: 10_000,
      retry: false,
    });
    const actual = JSON.parse(verified.data.users?.[0]?.customAttributes ?? "{}");
    if (Object.entries(claims).some(([key, value]) => actual[key] !== value))
      throw new Error("readback mismatch");
    console.info(
      "Access verified. The user must verify their email and sign in again; Owner/Approver must enroll TOTP.",
    );
  } catch {
    console.error(
      "Provisioning failed or could not be verified. Check project, UID and operator IAM; no credentials were logged.",
    );
    process.exitCode = 1;
  }
}
