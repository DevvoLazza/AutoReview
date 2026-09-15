import {
  type GoogleReviewNotification,
  googleReviewNotificationSchema,
  pubSubEnvelopeSchema,
} from "@reviewguard/contracts";
import { createDatabase, purgeExpiredGoogleContent } from "@reviewguard/database";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyGoogleOidc } from "./auth.js";

const publishTaskSchema = z.object({
  reviewId: z.string().uuid(),
  tenantId: z.string().uuid(),
  actorId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});

export type WorkerOptions = {
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export function createWorker(options: WorkerOptions = {}): FastifyInstance {
  const worker = Fastify({ logger: process.env.NODE_ENV !== "test" });
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const claimed = new Map<string, number>();

  worker.get("/health", async () => ({
    status: "ok",
    service: "reviewguard-worker",
    time: new Date().toISOString(),
  }));

  worker.post("/events/google-business", async (request, reply) => {
    await verifyGoogleOidc(request);
    const envelope = pubSubEnvelopeSchema.parse(request.body);
    pruneClaims(claimed, now());
    if (claimed.has(envelope.message.messageId)) return { duplicate: true };
    const _notification = parseNotification(envelope.message.data);
    claimed.set(envelope.message.messageId, now());
    try {
      await callApi(fetchImpl, "/webhooks/google-business", envelope);
      return reply.code(204).send();
    } catch (error) {
      claimed.delete(envelope.message.messageId);
      throw error;
    }
  });

  worker.post("/tasks/publish", async (request) => {
    await verifyGoogleOidc(request);
    const task = publishTaskSchema.parse(request.body);
    return callApi(fetchImpl, `/internal/reviews/${task.reviewId}/publish`, {
      tenantId: task.tenantId,
      actorId: task.actorId,
      expectedVersion: task.expectedVersion,
    });
  });

  worker.post("/tasks/purge-expired-google-content", async (request) => {
    await verifyGoogleOidc(request);
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString)
      throw Object.assign(new Error("DATABASE_URL is required"), { statusCode: 503 });
    const { db, pool } = createDatabase(connectionString);
    try {
      return { purged: await purgeExpiredGoogleContent(db) };
    } finally {
      await pool.end();
    }
  });

  worker.setErrorHandler((error, _request, reply) => {
    const normalized = error instanceof Error ? error : new Error("Unknown worker error");
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    const status = typeof statusCode === "number" ? statusCode : 500;
    reply.code(status).send({
      error: status >= 500 ? "worker_error" : "invalid_request",
      message: normalized.message,
    });
  });
  return worker;
}

function parseNotification(data: string): GoogleReviewNotification {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid Pub/Sub message payload"), { statusCode: 400 });
  }
  return googleReviewNotificationSchema.parse(value);
}

async function callApi(fetchImpl: typeof fetch, path: string, body: unknown): Promise<unknown> {
  const baseUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4100/v1";
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-reviewguard-worker-secret":
        process.env.INTERNAL_WORKER_SECRET ?? "reviewguard-local-worker-secret",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw Object.assign(new Error(`API returned ${response.status}`), {
      statusCode: response.status >= 500 ? 503 : response.status,
    });
  }
  if (response.status === 204) return null;
  return response.json();
}

function pruneClaims(claimed: Map<string, number>, time: number): void {
  const retentionMs = 24 * 60 * 60 * 1_000;
  for (const [messageId, claimedAt] of claimed) {
    if (time - claimedAt > retentionMs) claimed.delete(messageId);
  }
}

if (process.env.NODE_ENV !== "test") {
  const worker = createWorker();
  await worker.listen({ port: Number(process.env.WORKER_PORT ?? 4200), host: "0.0.0.0" });
}
