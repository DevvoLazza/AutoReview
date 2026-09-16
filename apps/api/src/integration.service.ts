import { Inject, Injectable } from "@nestjs/common";
import type { RequestPrincipal } from "@reviewguard/contracts";
import { DomainError, type GoogleBusinessGateway } from "@reviewguard/core";
import { GOOGLE_GATEWAY } from "./providers.js";
import { ReviewService } from "./review.service.js";
import { MemoryStore } from "./store.js";

@Injectable()
export class IntegrationService {
  constructor(
    private readonly store: MemoryStore,
    private readonly reviews: ReviewService,
    @Inject(GOOGLE_GATEWAY) private readonly google: GoogleBusinessGateway,
  ) {}
  async discover(principal: RequestPrincipal) {
    const token = await this.reviews.currentAccessToken(principal.tenantId);
    const accounts = await this.google.listAccounts(token);
    return {
      data: await Promise.all(
        accounts.map(async (account) => ({
          ...account,
          locations: await this.google.listLocations(token, account.name),
        })),
      ),
    };
  }
  async importLocation(principal: RequestPrincipal, accountName: string, locationName: string) {
    const token = await this.reviews.currentAccessToken(principal.tenantId);
    const accounts = await this.google.listAccounts(token);
    if (!accounts.some((account) => account.name === accountName))
      throw new DomainError("Google account is not authorized", "google_account_forbidden", 403);
    const allowed = (await this.google.listLocations(token, accountName)).find(
      (location) => location.name === locationName,
    );
    if (!allowed)
      throw new DomainError("Google location is not authorized", "google_location_forbidden", 403);
    const existing = (await this.store.listLocations(principal.tenantId)).find(
      (location) => location.googleLocationName === locationName,
    );
    const topic = process.env.GOOGLE_PUBSUB_TOPIC;
    if (process.env.GOOGLE_MODE === "live" && !topic)
      throw new DomainError(
        "Configure Google Pub/Sub before importing",
        "notifications_not_configured",
        503,
      );
    await this.google.configureNotifications(token, accountName, topic ?? "demo-topic");
    const location = await this.store.upsertLocation(principal.tenantId, {
      id: existing?.id ?? crypto.randomUUID(),
      googleAccountName: accountName,
      googleLocationName: locationName,
      displayName: allowed.title,
      active: true,
      defaultLanguage: existing?.defaultLanguage ?? "it",
      tone: existing?.tone ?? "professionale, umano e conciso",
    });
    await this.store.appendAudit(principal, "integration.connected", "location", location.id, {
      consentVersion: "google-location-consent-v1",
      accountName,
      locationName,
    });
    return location;
  }
  async sync(principal: RequestPrincipal, locationId: string, pageToken?: string) {
    const location = (await this.store.listLocations(principal.tenantId)).find(
      (entry) => entry.id === locationId && entry.active,
    );
    if (!location) throw new DomainError("Active location not found", "not_found", 404);
    const parent = `${location.googleAccountName}/${location.googleLocationName}`;
    const page = await this.google.listReviews(
      await this.reviews.currentAccessToken(principal.tenantId),
      parent,
      pageToken,
    );
    for (const snapshot of page.reviews)
      await this.store.createReview(principal.tenantId, { ...snapshot, locationId });
    return { imported: page.reviews.length, nextPageToken: page.nextPageToken ?? null };
  }
  async disconnect(principal: RequestPrincipal) {
    await this.store.saveSettings(principal.tenantId, {
      ...(await this.store.getSettings(principal.tenantId)),
      killSwitch: true,
    });
    const tokens = await this.store.getGoogleTokens(principal.tenantId);
    const locations = await this.store.listLocations(principal.tenantId);
    for (const location of locations)
      await this.store.upsertLocation(principal.tenantId, { ...location, active: false });
    let remoteCleanupPending = false;
    if (tokens) {
      try {
        const token = await this.reviews.currentAccessToken(principal.tenantId);
        for (const accountName of new Set(locations.map((location) => location.googleAccountName)))
          await this.google.configureNotifications(
            token,
            accountName,
            "",
            process.env.GOOGLE_PUBSUB_TOPIC,
          );
        await this.google.revoke(tokens.refreshToken ?? tokens.accessToken);
      } catch {
        remoteCleanupPending = true;
      }
    }
    await this.store.clearGoogleTokens(principal.tenantId);
    for (const kind of ["review", "publish", "device", "oauth", "event"])
      await this.store.repository.removeKind(principal.tenantId, kind);
    await this.store.appendAudit(
      principal,
      "integration.disconnected",
      "google_connection",
      principal.tenantId,
      { remoteCleanupPending },
    );
    return { disconnected: true, remoteCleanupPending };
  }
}
