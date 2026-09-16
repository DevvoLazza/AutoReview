import type { FastifyRequest } from "fastify";
import { createRemoteJWKSet, jwtVerify } from "jose";

const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function verifyGoogleOidc(request: FastifyRequest): Promise<void> {
  if (
    (process.env.WORKER_AUTH_MODE ?? "demo") === "demo" &&
    process.env.NODE_ENV !== "production"
  ) {
    return;
  }
  const authorization = request.headers.authorization;
  const audience = process.env.WORKER_PUBLIC_URL ?? `${request.protocol}://${request.hostname}`;
  const expectedEmail = process.env.PUSH_SERVICE_ACCOUNT_EMAIL;
  if (!authorization?.startsWith("Bearer ") || !audience || !expectedEmail) {
    throw Object.assign(new Error("Authenticated Google service identity is required"), {
      statusCode: 401,
    });
  }
  const result = await jwtVerify(authorization.slice("Bearer ".length), googleJwks, {
    audience,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  }).catch(() => {
    throw Object.assign(new Error("Invalid Google service identity"), { statusCode: 401 });
  });
  if (result.payload.email !== expectedEmail || result.payload.email_verified !== true) {
    throw Object.assign(new Error("Unexpected Google service identity"), { statusCode: 403 });
  }
}
