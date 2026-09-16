import { Injectable } from "@nestjs/common";
import type { RequestPrincipal, ReviewCase } from "@reviewguard/contracts";
import { ExpoNotificationGateway } from "@reviewguard/core";
import { MemoryStore } from "./store.js";

@Injectable()
export class ReviewNotificationService {
  constructor(private readonly store: MemoryStore) {}

  async reviewReady(principal: RequestPrincipal, review: ReviewCase): Promise<boolean> {
    const registrations = await this.store.listDeviceRegistrations(principal.tenantId);
    const userIds = [...new Set(registrations.map((registration) => registration.userId))];
    if (userIds.length === 0) return false;
    const gateway = new ExpoNotificationGateway(async (recipients) =>
      registrations
        .filter((registration) => recipients.includes(registration.userId))
        .map((registration) => registration.token),
    );
    const scheduled = review.status === "scheduled_auto";
    await gateway.send({
      userIds,
      title: scheduled ? "Risposta programmata" : "Risposta da approvare",
      body: scheduled
        ? "Apri ReviewGuard per controllare o annullare l'invio."
        : "Apri ReviewGuard per verificare la nuova bozza.",
      route: `/reviews/${review.id}`,
      category: scheduled ? "auto_scheduled" : "approval_required",
    });
    return true;
  }
}
