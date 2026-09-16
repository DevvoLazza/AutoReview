import { Injectable } from "@nestjs/common";
import type { RequestPrincipal, ReviewCase } from "@reviewguard/contracts";
import { ExpoNotificationGateway } from "@reviewguard/core";
import { MemoryStore } from "./store.js";

type PendingPush = {
  type: "push";
  reviewId: string;
  reviewVersion: number;
  actorId: string;
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number;
};

@Injectable()
export class ReviewNotificationService {
  constructor(private readonly store: MemoryStore) {}

  async reviewReady(principal: RequestPrincipal, review: ReviewCase): Promise<boolean> {
    if (!(await this.store.listDeviceRegistrations(principal.tenantId)).length) return false;
    const id = `push/${review.id}/${review.version}`;
    const value: PendingPush = {
      type: "push",
      reviewId: review.id,
      reviewVersion: review.version,
      actorId: principal.userId,
      attempts: 1,
      nextAttemptAt: Date.now() + 60_000,
      leaseUntil: Date.now() + 30_000,
    };
    const expiresAt = new Date(
      Math.min(
        Date.now() + 48 * 3_600_000,
        Date.parse(review.contentExpiresAt ?? new Date(Date.now() + 48 * 3_600_000).toISOString()),
      ),
    ).toISOString();
    if (!(await this.store.repository.put(principal.tenantId, "event", id, value, null, expiresAt)))
      return false;
    try {
      await this.send(principal.tenantId, review);
      await this.store.repository.remove(principal.tenantId, "event", id);
      return true; // Expo ticket acceptance, not proof of physical delivery.
    } catch (error) {
      await this.store.repository.put(
        principal.tenantId,
        "event",
        id,
        { ...value, leaseUntil: 0 },
        1,
      );
      throw error;
    }
  }

  async retryPending(tenantId: string) {
    const pending = (await this.store.repository.list<PendingPush>(tenantId, "event"))
      .filter(
        (entry) =>
          entry.value.type === "push" &&
          entry.value.nextAttemptAt <= Date.now() &&
          entry.value.leaseUntil <= Date.now(),
      )
      .slice(0, 12);
    let submitted = 0;
    for (let offset = 0; offset < pending.length; offset += 3) {
      await Promise.all(
        pending.slice(offset, offset + 3).map(async (entry) => {
          const value = {
            ...entry.value,
            attempts: entry.value.attempts + 1,
            leaseUntil: Date.now() + 30_000,
          };
          if (!(await this.store.repository.put(tenantId, "event", entry.id, value, entry.version)))
            return;
          try {
            const review = await this.store.getReview(tenantId, value.reviewId);
            if (
              review.version === value.reviewVersion &&
              ["pending_approval", "scheduled_auto"].includes(review.status)
            ) {
              await this.send(tenantId, review);
              await this.store.appendAudit(
                { tenantId, userId: value.actorId },
                "notification.sent",
                "review",
                review.id,
                { submitted: true, retry: value.attempts },
              );
              submitted++;
            }
            await this.store.repository.remove(tenantId, "event", entry.id);
          } catch {
            if (value.attempts >= 8) {
              await this.store.appendAudit(
                { tenantId, userId: value.actorId },
                "notification.failed",
                "review",
                value.reviewId,
                { exhausted: true },
              );
              await this.store.repository.remove(tenantId, "event", entry.id);
            } else
              await this.store.repository.put(
                tenantId,
                "event",
                entry.id,
                {
                  ...value,
                  leaseUntil: 0,
                  nextAttemptAt: Date.now() + Math.min(3_600_000, 60_000 * 2 ** value.attempts),
                },
                entry.version + 1,
              );
          }
        }),
      );
    }
    return { processed: pending.length, submitted };
  }

  private async send(tenantId: string, review: ReviewCase) {
    const registrations = await this.store.listDeviceRegistrations(tenantId);
    const userIds = [...new Set(registrations.map((registration) => registration.userId))];
    if (userIds.length === 0) return;
    const gateway = new ExpoNotificationGateway(
      async (recipients) =>
        registrations
          .filter((registration) => recipients.includes(registration.userId))
          .map((registration) => registration.token),
      fetch,
      (token) => this.store.removeDeviceToken(tenantId, token),
      process.env.EXPO_ACCESS_TOKEN,
    );
    const scheduled = review.status === "scheduled_auto";
    await gateway.send({
      userIds,
      title: scheduled ? "Risposta programmata" : "Risposta da approvare",
      body: scheduled
        ? "Apri AutoReview per controllare o annullare l'invio."
        : "Apri AutoReview per verificare la nuova bozza.",
      route: `/reviews/${review.id}`,
      category: scheduled ? "auto_scheduled" : "approval_required",
    });
  }
}
