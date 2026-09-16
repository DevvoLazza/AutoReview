import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { IdentityClient, type IdentitySession } from "@reviewguard/core";
import { cookies } from "next/headers";

const name = "autoreview_session";
function key(): Buffer {
  const value = process.env.AUTH_COOKIE_SECRET;
  if (!value) throw new Error("AUTH_COOKIE_SECRET is required for real web authentication");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32)
    throw new Error("AUTH_COOKIE_SECRET must be a base64-encoded 32-byte key");
  return decoded;
}
export function identity() {
  return new IdentityClient(process.env.IDENTITY_API_KEY ?? "");
}
export function demoMode() {
  return process.env.WEB_AUTH_MODE === "demo" && process.env.NODE_ENV !== "production";
}
export async function readSession(): Promise<IdentitySession | null> {
  const value = (await cookies()).get(name)?.value;
  if (!value) return null;
  try {
    const data = Buffer.from(value, "base64url");
    const cipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString());
  } catch {
    return null;
  }
}
export async function writeSession(session: IdentitySession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  (await cookies()).set(
    name,
    Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url"),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 86400,
    },
  );
}
export async function clearSession() {
  (await cookies()).delete(name);
}
export async function currentToken(): Promise<string | null> {
  const session = await readSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session.idToken;
  const refreshed = await identity().refresh(session.refreshToken);
  await writeSession(refreshed);
  return refreshed.idToken;
}
export function checkOrigin(request: Request) {
  if (request.method !== "GET" && request.headers.get("origin") !== new URL(request.url).origin)
    throw new Error("Request origin is not allowed");
}
