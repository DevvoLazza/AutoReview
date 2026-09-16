import {
  type GoogleReviewNotification,
  googleReviewNotificationSchema,
  pubSubEnvelopeSchema,
} from "@reviewguard/contracts";
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

  worker.get("/health", async () => ({
    status: "ok",
    service: "reviewguard-worker",
    time: new Date().toISOString(),
  }));

  worker.post("/events/google-business", async (request, reply) => {
    await verifyGoogleOidc(request);
    const envelope = pubSubEnvelopeSchema.parse(request.body);
    const _notification = parseNotification(envelope.message.data);
    // Only the durable API lease may deduplicate. In-flight redelivery must not be acknowledged early.
    await callApi(fetchImpl, "/webhooks/google-business", envelope);
    return reply.code(204).send();
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
    return callApi(fetchImpl, "/internal/reviews/purge-expired-google-content", {});
  });
  worker.post("/tasks/retry-notifications", async (request) => {
    await verifyGoogleOidc(request);
    return callApi(fetchImpl, "/internal/reviews/retry-notifications", {});
  });

  worker.setErrorHandler((error, _request, reply) => {
    const normalized = error instanceof Error ? error : new Error("Unknown worker error");
    const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
    const status = typeof statusCode === "number" ? statusCode : 500;
    reply.code(status).send({
      error: status >= 500 ? "worker_error" : "invalid_request",
      message:
        status >= 500
          ? "Worker request failed; retry or inspect service metrics"
          : normalized.message,
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
    signal: AbortSignal.timeout(95_000),
  });
  if (!response.ok) {
    throw Object.assign(new Error(`API returned ${response.status}`), {
      statusCode: response.status >= 500 ? 503 : response.status,
    });
  }
  if (response.status === 204) return null;
  return response.json();
}

if (process.env.NODE_ENV !== "test") {
  const worker = createWorker();
  await worker.listen({ port: Number(process.env.WORKER_PORT ?? 4200), host: "0.0.0.0" });
}
