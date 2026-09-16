import { createHash } from "node:crypto";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type {
  AuditEvent,
  AutomationRule,
  KnowledgeSource,
  RequestPrincipal,
  ReviewCase,
  ReviewSnapshot,
} from "@reviewguard/contracts";
import {
  DomainError,
  type GoogleTokens,
  NotFoundError,
  transitionReview,
  VersionConflictError,
} from "@reviewguard/core";
import {
  MemoryRecordRepository,
  PostgresRecordRepository,
  type RecordRepository,
} from "@reviewguard/database";
import { DEMO_KNOWLEDGE, DEMO_REVIEWS, DEMO_RULES, DEMO_TENANT_ID } from "./demo.js";
import { KmsTokenVault, TokenVault } from "./token-vault.js";

export type Location = {
  id: string;
  googleAccountName: string;
  googleLocationName: string;
  displayName: string;
  active: boolean;
  defaultLanguage: string;
  tone: string;
};
export type Settings = { killSwitch: boolean; defaultLanguage: string; tone: string };
export type StoredGoogleTokens = GoogleTokens & { expiresAt: number };

// The injection name is retained for compatibility; STORAGE_MODE selects the repository.
@Injectable()
export class MemoryStore implements OnModuleInit, OnModuleDestroy {
  readonly repository: RecordRepository;
  private readonly vault: TokenVault | KmsTokenVault;
  constructor() {
    const persistent = process.env.STORAGE_MODE === "postgres";
    if (process.env.NODE_ENV === "production" && (!persistent || !process.env.GOOGLE_KMS_KEY_NAME))
      throw new Error("Production requires PostgreSQL and GOOGLE_KMS_KEY_NAME");
    if (
      persistent &&
      (!process.env.DATABASE_URL ||
        (!process.env.TOKEN_ENCRYPTION_KEY && !process.env.GOOGLE_KMS_KEY_NAME))
    )
      throw new Error("Persistent storage requires DATABASE_URL and an encryption key");
    this.repository = persistent
      ? new PostgresRecordRepository(process.env.DATABASE_URL as string)
      : new MemoryRecordRepository();
    this.vault = process.env.GOOGLE_KMS_KEY_NAME
      ? new KmsTokenVault(process.env.GOOGLE_KMS_KEY_NAME)
      : new TokenVault(process.env.TOKEN_ENCRYPTION_KEY);
  }
  async onModuleInit() {
    if (
      process.env.NODE_ENV === "production" &&
      this.repository instanceof PostgresRecordRepository
    )
      await this.repository.assertSafeRuntimeRole(process.env.GOOGLE_WEBHOOK_TENANT_ID as string);
    if ((process.env.AUTH_MODE ?? "demo") === "demo" && process.env.NODE_ENV !== "production") {
      for (const [kind, entries] of [
        ["review", DEMO_REVIEWS],
        ["knowledge", DEMO_KNOWLEDGE],
        ["rule", DEMO_RULES],
      ] as const) {
        for (const entry of entries)
          await this.repository.put(entry.tenantId, kind, entry.id, entry, null);
      }
      const first = DEMO_REVIEWS[0];
      if (!first) return;
      await this.upsertLocation(DEMO_TENANT_ID, {
        id: first.snapshot.locationId,
        googleAccountName: "accounts/demo",
        googleLocationName: `locations/${first.snapshot.locationId}`,
        displayName: "Sede dimostrativa",
        active: true,
        defaultLanguage: "it",
        tone: "professionale, umano e conciso",
      });
    }
  }
  async onModuleDestroy() {
    await this.repository.close();
  }
  private async values<T>(tenantId: string, kind: string): Promise<T[]> {
    return (await this.repository.list<T>(tenantId, kind)).map((entry) => entry.value);
  }
  async listReviews(tenantId: string, status?: ReviewCase["status"]): Promise<ReviewCase[]> {
    return (await this.values<ReviewCase>(tenantId, "review"))
      .filter((review) => !status || review.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async getReview(tenantId: string, id: string): Promise<ReviewCase> {
    const entry = await this.repository.get<ReviewCase>(tenantId, "review", id);
    if (!entry) throw new NotFoundError("Review", id);
    return entry.value;
  }
  async findReviewByGoogleName(tenantId: string, name: string) {
    return (
      (await this.listReviews(tenantId)).find(
        (entry) => entry.snapshot.googleReviewName === name,
      ) ?? null
    );
  }
  async createReview(tenantId: string, snapshot: ReviewSnapshot): Promise<ReviewCase> {
    const id = deterministicUuid(snapshot.googleReviewName);
    const existing =
      (await this.repository.get<ReviewCase>(tenantId, "review", id)) ??
      ((process.env.AUTH_MODE ?? "demo") === "demo"
        ? await this.repository.list<ReviewCase>(tenantId, "review")
        : []
      ).find((entry) => entry.value.snapshot.googleReviewName === snapshot.googleReviewName);
    if (existing) {
      if (existing.value.snapshot.updateTime === snapshot.updateTime) return existing.value;
      const updated = {
        ...existing.value,
        snapshot,
        status: "needs_attention" as const,
        activeDraft: null,
        validation: null,
        scheduledAt: null,
        matchedRuleId: null,
        version: existing.value.version + 1,
        updatedAt: new Date().toISOString(),
        contentExpiresAt: expiry(),
        wasUpdated: true,
      };
      if (
        !(await this.repository.put(
          tenantId,
          "review",
          existing.id,
          updated,
          existing.version,
          expiry(),
        ))
      )
        throw new VersionConflictError(existing.version, existing.version + 1);
      return updated;
    }
    const now = new Date().toISOString();
    const review: ReviewCase = {
      id,
      tenantId,
      snapshot,
      status: snapshot.existingReply ? "needs_attention" : "received",
      version: 1,
      activeDraft: null,
      validation: null,
      scheduledAt: null,
      matchedRuleId: null,
      publishedAt: null,
      publishedReply: null,
      createdAt: now,
      updatedAt: now,
      contentExpiresAt: expiry(),
      wasUpdated: false,
    };
    if (!(await this.repository.put(tenantId, "review", id, review, null, expiry())))
      return this.getReview(tenantId, id);
    return review;
  }
  async saveReview(review: ReviewCase, expectedVersion = review.version - 1): Promise<ReviewCase> {
    const record = await this.repository.get<ReviewCase>(review.tenantId, "review", review.id);
    if (!record) throw new NotFoundError("Review", review.id);
    if (
      record.value.version !== expectedVersion ||
      !(await this.repository.put(review.tenantId, "review", review.id, review, record.version))
    )
      throw new VersionConflictError(expectedVersion, record.value.version);
    return review;
  }
  async transition(
    tenantId: string,
    id: string,
    status: ReviewCase["status"],
    expectedVersion: number,
    patch: Partial<ReviewCase> = {},
  ) {
    return this.saveReview(
      transitionReview(await this.getReview(tenantId, id), status, expectedVersion, patch),
      expectedVersion,
    );
  }
  async beginPublication(review: ReviewCase, intent: unknown, intentVersion: number | null) {
    const record = await this.repository.get<ReviewCase>(review.tenantId, "review", review.id);
    if (!record || record.value.version !== review.version)
      throw new VersionConflictError(review.version, record?.value.version ?? 0);
    const next = transitionReview(review, "publishing", review.version);
    const expiresAt =
      review.contentExpiresAt ??
      new Date(Date.parse(review.createdAt) + 21 * 86_400_000).toISOString();
    if (
      !(await this.repository.putMany(review.tenantId, [
        { kind: "review", id: review.id, value: next, expectedVersion: record.version, expiresAt },
        {
          kind: "publish",
          id: review.id,
          value: intent,
          expectedVersion: intentVersion,
          expiresAt,
        },
      ]))
    )
      throw new VersionConflictError(review.version, review.version + 1);
    return next;
  }
  async listKnowledge(tenantId: string) {
    return this.values<KnowledgeSource>(tenantId, "knowledge");
  }
  async createKnowledge(
    principal: RequestPrincipal,
    input: Omit<
      KnowledgeSource,
      "id" | "tenantId" | "status" | "version" | "authorId" | "sha256" | "createdAt" | "updatedAt"
    >,
  ): Promise<KnowledgeSource> {
    const now = new Date().toISOString();
    const entry: KnowledgeSource = {
      ...input,
      id: crypto.randomUUID(),
      tenantId: principal.tenantId,
      status: "draft",
      version: 1,
      authorId: principal.userId,
      sha256: createHash("sha256").update(input.content).digest("hex"),
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.put(principal.tenantId, "knowledge", entry.id, entry, null);
    return entry;
  }
  async approveKnowledge(tenantId: string, id: string, expectedVersion: number) {
    return this.changeKnowledge(tenantId, id, "approved", {}, expectedVersion);
  }
  async changeKnowledge(
    tenantId: string,
    id: string,
    status: KnowledgeSource["status"],
    patch: Partial<KnowledgeSource> = {},
    expectedVersion?: number,
  ) {
    const entry = await this.repository.get<KnowledgeSource>(tenantId, "knowledge", id);
    if (!entry) throw new NotFoundError("Knowledge source", id);
    if (expectedVersion !== undefined && expectedVersion !== entry.value.version)
      throw new VersionConflictError(expectedVersion, entry.value.version);
    const value = {
      ...entry.value,
      ...patch,
      id,
      tenantId,
      status,
      version: entry.value.version + 1,
      sha256: createHash("sha256")
        .update(patch.content ?? entry.value.content)
        .digest("hex"),
      updatedAt: new Date().toISOString(),
    };
    if (!(await this.repository.put(tenantId, "knowledge", id, value, entry.version)))
      throw new VersionConflictError(entry.version, entry.version + 1);
    return value;
  }
  async listRules(tenantId: string) {
    return this.values<AutomationRule>(tenantId, "rule");
  }
  async createRule(
    tenantId: string,
    input: Omit<
      AutomationRule,
      | "id"
      | "tenantId"
      | "consentVersion"
      | "consentedBy"
      | "consentedAt"
      | "createdAt"
      | "updatedAt"
    >,
  ) {
    const now = new Date().toISOString();
    const rule: AutomationRule = {
      ...input,
      id: crypto.randomUUID(),
      tenantId,
      enabled: false,
      consentVersion: null,
      consentedBy: null,
      consentedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.put(tenantId, "rule", rule.id, rule, null);
    return rule;
  }
  async enableRule(principal: RequestPrincipal, id: string) {
    return this.setRuleEnabled(principal, id, true);
  }
  async setRuleEnabled(principal: RequestPrincipal, id: string, enabled: boolean) {
    const entry = await this.repository.get<AutomationRule>(principal.tenantId, "rule", id);
    if (!entry) throw new NotFoundError("Automation rule", id);
    const now = new Date().toISOString();
    const value = {
      ...entry.value,
      enabled,
      consentVersion: enabled ? "automation-consent-v1" : null,
      consentedBy: enabled ? principal.userId : null,
      consentedAt: enabled ? now : null,
      updatedAt: now,
    };
    if (!(await this.repository.put(principal.tenantId, "rule", id, value, entry.version)))
      throw new VersionConflictError(entry.version, entry.version + 1);
    return value;
  }
  async appendAudit(
    principal: Pick<RequestPrincipal, "tenantId" | "userId">,
    action: AuditEvent["action"],
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ) {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      tenantId: principal.tenantId,
      actorId: principal.userId,
      action,
      entityType,
      entityId,
      metadata,
      createdAt: new Date().toISOString(),
    };
    await this.repository.put(principal.tenantId, "audit", event.id, event, null);
    return event;
  }
  async listAudit(tenantId: string) {
    return (await this.values<AuditEvent>(tenantId, "audit")).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
  async claimEvent(tenantId: string, id: string): Promise<boolean> {
    const entry = await this.repository.get<{ completed: boolean; leaseUntil: number }>(
      tenantId,
      "event",
      id,
    );
    if (entry?.value.completed) return false;
    if (entry && entry.value.leaseUntil > Date.now())
      throw new DomainError("Event processing is in progress", "event_busy", 503);
    const claimed = await this.repository.put(
      tenantId,
      "event",
      id,
      { completed: false, leaseUntil: Date.now() + 120_000 },
      entry?.version ?? null,
      expiry(2),
    );
    if (!claimed) throw new DomainError("Event lease conflict", "event_busy", 503);
    return true;
  }
  async completeEvent(tenantId: string, id: string) {
    const entry = await this.repository.get(tenantId, "event", id);
    if (entry)
      await this.repository.put(
        tenantId,
        "event",
        id,
        { completed: true, leaseUntil: 0 },
        entry.version,
      );
  }
  async releaseEvent(tenantId: string, id: string) {
    await this.repository.remove(tenantId, "event", id);
  }
  async setGoogleTokens(tenantId: string, tokens: GoogleTokens) {
    const current = await this.getGoogleTokens(tenantId);
    const value = {
      ...tokens,
      refreshToken: tokens.refreshToken ?? current?.refreshToken ?? null,
      expiresAt: Date.now() + Math.max(60, tokens.expiresIn - 60) * 1_000,
    };
    const record = await this.repository.get(tenantId, "google_tokens", "connection");
    if (
      !(await this.repository.put(
        tenantId,
        "google_tokens",
        "connection",
        { encrypted: await this.vault.seal(value, tenantId) },
        record?.version ?? null,
      ))
    )
      throw new VersionConflictError(record?.version ?? 0, (record?.version ?? 0) + 1);
  }
  async getGoogleTokens(tenantId: string): Promise<StoredGoogleTokens | null> {
    const record = await this.repository.get<{ encrypted: string }>(
      tenantId,
      "google_tokens",
      "connection",
    );
    return record ? this.vault.open<StoredGoogleTokens>(record.value.encrypted, tenantId) : null;
  }
  async clearGoogleTokens(tenantId: string) {
    await this.repository.remove(tenantId, "google_tokens", "connection");
  }
  async listDeviceRegistrations(tenantId: string) {
    return this.values<{ token: string; userId: string }>(tenantId, "device");
  }
  async registerDevice(
    principal: RequestPrincipal,
    input: { token: string; platform: string; provider: string },
  ) {
    const id = createHash("sha256").update(input.token).digest("hex");
    const entry = await this.repository.get(principal.tenantId, "device", id);
    await this.repository.put(
      principal.tenantId,
      "device",
      id,
      { ...input, userId: principal.userId },
      entry?.version ?? null,
    );
    return { registered: true as const };
  }
  async manualApprovalCount(tenantId: string, locationId: string) {
    return (
      (await this.repository.get<{ count: number }>(tenantId, "counter", `manual/${locationId}`))
        ?.value.count ?? 0
    );
  }
  async sentTodayByRule(tenantId: string, ruleIds: readonly string[]) {
    return Object.fromEntries(
      await Promise.all(
        ruleIds.map(async (id) => [
          id,
          (
            await this.repository.get<{ count: number }>(
              tenantId,
              "counter",
              `rule/${id}/${new Date().toISOString().slice(0, 10)}`,
            )
          )?.value.count ?? 0,
        ]),
      ),
    );
  }
  async increment(tenantId: string, id: string) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const entry = await this.repository.get<{ count: number }>(tenantId, "counter", id);
      if (
        await this.repository.put(
          tenantId,
          "counter",
          id,
          { count: (entry?.value.count ?? 0) + 1 },
          entry?.version ?? null,
        )
      )
        return;
    }
    throw new Error("Counter contention");
  }
  async recordPublished(review: ReviewCase, manual: boolean) {
    if (manual) await this.increment(review.tenantId, `manual/${review.snapshot.locationId}`);
  }
  async reserveRuleSlot(tenantId: string, ruleId: string, limit: number): Promise<boolean> {
    const id = `rule/${ruleId}/${new Date().toISOString().slice(0, 10)}`;
    for (let attempt = 0; attempt < 10; attempt++) {
      const entry = await this.repository.get<{ count: number }>(tenantId, "counter", id);
      const count = entry?.value.count ?? 0;
      if (count >= limit) return false;
      if (
        await this.repository.put(
          tenantId,
          "counter",
          id,
          { count: count + 1 },
          entry?.version ?? null,
        )
      )
        return true;
    }
    return false;
  }
  async getSettings(tenantId: string): Promise<Settings> {
    return (
      (await this.repository.get<Settings>(tenantId, "settings", "business"))?.value ?? {
        killSwitch: true,
        defaultLanguage: "it",
        tone: "professionale, umano e conciso",
      }
    );
  }
  async saveSettings(tenantId: string, settings: Settings) {
    const record = await this.repository.get(tenantId, "settings", "business");
    if (
      !(await this.repository.put(
        tenantId,
        "settings",
        "business",
        settings,
        record?.version ?? null,
      ))
    )
      throw new VersionConflictError(record?.version ?? 0, (record?.version ?? 0) + 1);
    return settings;
  }
  async listLocations(tenantId: string) {
    return this.values<Location>(tenantId, "location");
  }
  async upsertLocation(tenantId: string, location: Location) {
    const record = await this.repository.get<Location>(tenantId, "location", location.id);
    const value = { ...record?.value, ...location };
    if (
      !(await this.repository.put(
        tenantId,
        "location",
        location.id,
        value,
        record?.version ?? null,
      ))
    )
      throw new VersionConflictError(record?.version ?? 0, (record?.version ?? 0) + 1);
    return value;
  }
}
// Leave room for hourly cleanup and seven-day encrypted backup/PITR retention.
function expiry(days = 21) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
function deterministicUuid(value: string) {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
