import { CloudTasksClient } from "@google-cloud/tasks";
import { Injectable } from "@nestjs/common";
import type { ReviewCase } from "@reviewguard/contracts";

@Injectable()
export class PublishTaskScheduler {
  private readonly client = process.env.TASKS_MODE === "live" ? new CloudTasksClient() : null;

  async schedule(review: ReviewCase, actorId: string): Promise<{ taskName: string }> {
    if (!review.scheduledAt) throw new Error("Scheduled review has no delivery time");
    if (!this.client) return { taskName: `demo/${review.id}/${review.version}` };

    const project = required("GOOGLE_CLOUD_PROJECT");
    const location = process.env.TASKS_LOCATION ?? "europe-west8";
    const queue = required("TASKS_QUEUE");
    const workerUrl = required("WORKER_PUBLIC_URL").replace(/\/$/, "");
    const serviceAccountEmail = required("PUSH_SERVICE_ACCOUNT_EMAIL");
    const parent = this.client.queuePath(project, location, queue);
    const payload = {
      reviewId: review.id,
      tenantId: review.tenantId,
      actorId,
      expectedVersion: review.version,
    };
    const [task] = await this.client.createTask({
      parent,
      task: {
        scheduleTime: { seconds: Math.floor(new Date(review.scheduledAt).getTime() / 1_000) },
        httpRequest: {
          httpMethod: "POST",
          url: `${workerUrl}/tasks/publish`,
          headers: { "Content-Type": "application/json" },
          oidcToken: { serviceAccountEmail, audience: workerUrl },
          body: Buffer.from(JSON.stringify(payload)),
        },
      },
    });
    return { taskName: task.name ?? "unknown" };
  }
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when TASKS_MODE=live`);
  return value;
}
