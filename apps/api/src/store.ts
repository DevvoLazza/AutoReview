import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  AuditEvent,
  AutomationRule,
  KnowledgeSource,
  RequestPrincipal,
  ReviewCase,
  ReviewSnapshot,
} from "@reviewguard/contracts";
import type { GoogleTokens } from "@reviewguard/core";
import { NotFoundError, transitionReview } from "@reviewguard/core";
import { DEMO_KNOWLEDGE, DEMO_REVIEWS, DEMO_RULES } from "./demo.js";

@Injectable()
export class MemoryStore {
  private readonly reviews = new Map(
    DEMO_REVIEWS.map((review) => [review.id, structuredClone(review)]),
  );
  private readonly knowledge = new Map(
    DEMO_KNOWLEDGE.map((entry) => [entry.id, structuredClone(entry)]),
  );
  private readonly rules = new Map(DEMO_RULES.map((rule) => [rule.id, structuredClone(rule)]));
  private readonly audit: AuditEvent[] = [];
  private readonly processedEvents = new Set<string>();
  private readonly googleTokens = new Map<string, GoogleTokens & { expiresAt: number }>();
  private readonly deviceTokens = new Map<
    string,
    { tenantId: string; userId: string; platform: string; provider: string }
  >();
  private readonly manualApprovalsByLocation = new Map<string, number>();
  private readonly publishedTodayByRule = new Map<string, { date: string; count: number }>();

  listReviews(tenantId: string, status?: ReviewCase["status"]): ReviewCase[] {
    return [...this.reviews.values()]
      .filter((review) => review.tenantId === tenantId && (!status || review.status === status))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((review) => structuredClone(review));
  }

  getReview(tenantId: string, id: string): ReviewCase {
    const review = this.reviews.get(id);
    if (!review || review.tenantId !== tenantId) throw new NotFoundError("Review", id);
    return structuredClone(review);
  }

  findReviewByGoogleName(tenantId: string, name: string): ReviewCase | null {
    const review = [...this.reviews.values()].find(
      (candidate) =>
        candidate.tenantId === tenantId && candidate.snapshot.googleReviewName === name,
    );
    return review ? structuredClone(review) : null;
  }

  createReview(tenantId: string, snapshot: ReviewSnapshot): ReviewCase {
    const existing = this.findReviewByGoogleName(tenantId, snapshot.googleReviewName);
    if (existing) return existing;
    const now = new Date().toISOString();
    const review: ReviewCase = {
      id: crypto.randomUUID(),
      tenantId,
      snapshot,
      status: "received",
      version: 1,
      activeDraft: null,
      validation: null,
      scheduledAt: null,
      matchedRuleId: null,
      publishedAt: null,
      publishedReply: null,
      createdAt: now,
      updatedAt: now,
    };
    this.reviews.set(review.id, review);
    return structuredClone(review);
  }

  saveReview(review: ReviewCase): ReviewCase {
    this.reviews.set(review.id, structuredClone(review));
    return structuredClone(review);
  }

  transition(
    tenantId: string,
    id: string,
    status: ReviewCase["status"],
    expectedVersion: number,
    patch: Partial<ReviewCase> = {},
  ): ReviewCase {
    return this.saveReview(
      transitionReview(this.getReview(tenantId, id), status, expectedVersion, patch),
    );
  }

  listKnowledge(tenantId: string): KnowledgeSource[] {
    return [...this.knowledge.values()]
      .filter((entry) => entry.tenantId === tenantId)
      .map((entry) => structuredClone(entry));
  }

  createKnowledge(
    principal: RequestPrincipal,
    input: Omit<
      KnowledgeSource,
      "id" | "tenantId" | "status" | "version" | "authorId" | "sha256" | "createdAt" | "updatedAt"
    >,
  ): KnowledgeSource {
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
    this.knowledge.set(entry.id, entry);
    return structuredClone(entry);
  }

  approveKnowledge(tenantId: string, id: string): KnowledgeSource {
    const entry = this.knowledge.get(id);
    if (!entry || entry.tenantId !== tenantId) throw new NotFoundError("Knowledge source", id);
    const approved = {
      ...entry,
      status: "approved" as const,
      version: entry.version + 1,
      updatedAt: new Date().toISOString(),
    };
    this.knowledge.set(id, approved);
    return structuredClone(approved);
  }

  listRules(tenantId: string): AutomationRule[] {
    return [...this.rules.values()]
      .filter((rule) => rule.tenantId === tenantId)
      .map((rule) => structuredClone(rule));
  }

  createRule(
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
  ): AutomationRule {
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
    this.rules.set(rule.id, rule);
    return structuredClone(rule);
  }

  enableRule(principal: RequestPrincipal, id: string): AutomationRule {
    const rule = this.rules.get(id);
    if (!rule || rule.tenantId !== principal.tenantId)
      throw new NotFoundError("Automation rule", id);
    const now = new Date().toISOString();
    const enabled = {
      ...rule,
      enabled: true,
      consentVersion: "automation-consent-v1",
      consentedBy: principal.userId,
      consentedAt: now,
      updatedAt: now,
    };
    this.rules.set(id, enabled);
    return structuredClone(enabled);
  }

  appendAudit(
    principal: Pick<RequestPrincipal, "tenantId" | "userId">,
    action: AuditEvent["action"],
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown> = {},
  ): AuditEvent {
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
    this.audit.push(event);
    return structuredClone(event);
  }

  listAudit(tenantId: string): AuditEvent[] {
    return this.audit
      .filter((event) => event.tenantId === tenantId)
      .map((event) => structuredClone(event))
      .reverse();
  }

  claimEvent(messageId: string): boolean {
    if (this.processedEvents.has(messageId)) return false;
    this.processedEvents.add(messageId);
    return true;
  }

  setGoogleTokens(tenantId: string, tokens: GoogleTokens): void {
    this.googleTokens.set(tenantId, {
      ...tokens,
      expiresAt: Date.now() + Math.max(60, tokens.expiresIn - 60) * 1_000,
    });
  }

  getGoogleTokens(tenantId: string): (GoogleTokens & { expiresAt: number }) | null {
    return this.googleTokens.get(tenantId) ?? null;
  }

  listDeviceRegistrations(tenantId: string): Array<{ token: string; userId: string }> {
    return [...this.deviceTokens.entries()]
      .filter(([, registration]) => registration.tenantId === tenantId)
      .map(([token, registration]) => ({ token, userId: registration.userId }));
  }

  registerDevice(
    principal: RequestPrincipal,
    input: { token: string; platform: string; provider: string },
  ): { registered: true } {
    this.deviceTokens.set(input.token, {
      tenantId: principal.tenantId,
      userId: principal.userId,
      platform: input.platform,
      provider: input.provider,
    });
    return { registered: true };
  }

  manualApprovalCount(locationId: string): number {
    return this.manualApprovalsByLocation.get(locationId) ?? 0;
  }

  sentTodayByRule(ruleIds: readonly string[]): Record<string, number> {
    const today = new Date().toISOString().slice(0, 10);
    return Object.fromEntries(
      ruleIds.map((ruleId) => {
        const current = this.publishedTodayByRule.get(ruleId);
        return [ruleId, current?.date === today ? current.count : 0];
      }),
    );
  }

  recordPublished(review: ReviewCase, manual: boolean): void {
    if (manual) {
      this.manualApprovalsByLocation.set(
        review.snapshot.locationId,
        this.manualApprovalCount(review.snapshot.locationId) + 1,
      );
    }
    if (review.matchedRuleId) {
      const today = new Date().toISOString().slice(0, 10);
      const current = this.publishedTodayByRule.get(review.matchedRuleId);
      this.publishedTodayByRule.set(review.matchedRuleId, {
        date: today,
        count: current?.date === today ? current.count + 1 : 1,
      });
    }
  }
}
