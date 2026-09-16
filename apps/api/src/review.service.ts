import { Inject, Injectable } from "@nestjs/common";
import type { RequestPrincipal, ReviewCase, ReviewSnapshot } from "@reviewguard/contracts";
import {
  assertExpectedVersion,
  DomainError,
  decideAutomation,
  detectHardStops,
  type GoogleBusinessGateway,
  type ReplyModelProvider,
} from "@reviewguard/core";
import { KnowledgeService } from "./knowledge.service.js";
import { ReviewNotificationService } from "./notifications.js";
import { AI_PROVIDER, GOOGLE_GATEWAY } from "./providers.js";
import { MemoryStore } from "./store.js";
import { PublishTaskScheduler } from "./tasks.js";

type PublishIntent = { text: string; baseVersion: number; manual: boolean; startedAt: number };

@Injectable()
export class ReviewService {
  constructor(
    private readonly store: MemoryStore,
    @Inject(AI_PROVIDER) private readonly ai: ReplyModelProvider,
    @Inject(GOOGLE_GATEWAY) private readonly google: GoogleBusinessGateway,
    private readonly notifications: ReviewNotificationService,
    private readonly tasks: PublishTaskScheduler,
    private readonly knowledgeService: KnowledgeService,
  ) {}
  list(principal: RequestPrincipal, status?: ReviewCase["status"]) {
    return this.store.listReviews(principal.tenantId, status);
  }
  get(principal: RequestPrincipal, id: string) {
    return this.store.getReview(principal.tenantId, id);
  }
  async ingestAndGenerate(
    principal: RequestPrincipal,
    snapshot: ReviewSnapshot,
    updatedEvent = false,
  ): Promise<ReviewCase> {
    let review = await this.store.createReview(principal.tenantId, snapshot, updatedEvent);
    if (
      snapshot.existingReply ||
      ["pending_approval", "scheduled_auto", "published", "publishing", "rejected"].includes(
        review.status,
      )
    )
      return review;
    if (review.status === "generating") {
      if (Date.now() - Date.parse(review.updatedAt) < 120_000)
        throw new DomainError("Generation is still in progress", "generation_busy", 503);
      review = await this.store.transition(
        principal.tenantId,
        review.id,
        "needs_attention",
        review.version,
      );
    }
    await this.store.appendAudit(principal, "review.received", "review", review.id);
    return this.generate(principal, review.id, review.version);
  }
  async generate(
    principal: RequestPrincipal,
    id: string,
    expectedVersion: number,
    instruction?: string,
  ): Promise<ReviewCase> {
    let current = await this.store.getReview(principal.tenantId, id);
    assertExpectedVersion(current, expectedVersion);
    if (current.status === "scheduled_auto")
      current = await this.cancelSchedule(principal, id, current.version);
    if (current.status === "generating" && Date.now() - Date.parse(current.updatedAt) >= 120_000)
      current = await this.store.transition(
        principal.tenantId,
        id,
        "needs_attention",
        current.version,
      );
    const generating = await this.store.transition(
      principal.tenantId,
      id,
      "generating",
      current.version,
    );
    try {
      const [sources, settings, locations, rules] = await Promise.all([
        this.store.listKnowledge(principal.tenantId),
        this.store.getSettings(principal.tenantId),
        this.store.listLocations(principal.tenantId),
        this.store.listRules(principal.tenantId),
      ]);
      const knowledge = await this.knowledgeService.retrieve(
        principal.tenantId,
        current.snapshot,
        sources,
      );
      const location = locations.find((entry) => entry.id === current.snapshot.locationId);
      const input = {
        review: current.snapshot,
        knowledge,
        defaultLanguage: location?.defaultLanguage ?? settings.defaultLanguage,
        tone: location?.tone ?? settings.tone,
        instruction,
        previousDraft: current.activeDraft?.text,
      };
      const generated = await this.ai.generateDraft(input);
      const checked = await this.ai.validateDraft({ ...input, draft: generated.value });
      const flags = detectHardStops(current.snapshot);
      if (current.wasUpdated) flags.push("review_updated");
      if (!knowledge.length) flags.push("insufficient_knowledge");
      if (
        (knowledge.length > 0 && generated.value.knowledgeSourceIds.length === 0) ||
        generated.value.knowledgeSourceIds.some(
          (sourceId) => !knowledge.some((entry) => entry.sourceId === sourceId),
        ) ||
        generated.value.unsupportedClaims.length ||
        checked.value.unsupportedClaims.length
      )
        flags.push("unsupported_claim");
      if (generated.value.language.toLowerCase() !== checked.value.detectedLanguage.toLowerCase())
        flags.push("validator_disagreement");
      const validation = {
        ...checked.value,
        valid: checked.value.valid && flags.length === 0,
        riskFlags: [...new Set([...checked.value.riskFlags, ...flags])],
      };
      const draft = {
        ...generated.value,
        riskFlags: [...new Set([...generated.value.riskFlags, ...flags])],
        requiresHumanReview:
          generated.value.requiresHumanReview ||
          !validation.valid ||
          generated.value.riskFlags.length > 0,
      };
      const decision = decideAutomation({
        review: generating,
        draft,
        validation,
        rules,
        approvedManualCount: await this.store.manualApprovalCount(
          principal.tenantId,
          current.snapshot.locationId,
        ),
        sentTodayByRule: await this.store.sentTodayByRule(
          principal.tenantId,
          rules.map((rule) => rule.id),
        ),
        globalKillSwitch:
          settings.killSwitch ||
          Boolean(instruction) ||
          process.env.AUTOMATION_RELEASE_APPROVED !== "true",
      });
      let result = await this.store.transition(
        principal.tenantId,
        id,
        decision.action === "schedule_auto" ? "scheduled_auto" : "pending_approval",
        generating.version,
        {
          activeDraft: draft,
          validation,
          scheduledAt: decision.scheduledAt,
          matchedRuleId: decision.matchedRuleId,
          knowledgeVersions: Object.fromEntries(
            knowledge.map((entry) => [entry.sourceId, entry.version]),
          ),
        },
      );
      await this.store.appendAudit(
        principal,
        instruction ? "draft.revised" : "draft.generated",
        "review",
        id,
        {
          model: generated.model,
          provider: generated.provider,
          requestId: generated.requestId,
          validationModel: checked.model,
          promptVersion: "reply-draft-v1",
          knowledgeVersions: knowledge.map((entry) => ({
            id: entry.sourceId,
            version: entry.version,
          })),
          automationDecision: decision.action,
          riskFlags: draft.riskFlags,
        },
      );
      if (result.status === "scheduled_auto") {
        try {
          const task = await this.tasks.schedule(result, principal.userId);
          await this.store.appendAudit(principal, "review.scheduled", "review", id, {
            scheduledAt: result.scheduledAt,
            taskName: task.taskName,
          });
        } catch {
          result = await this.store.transition(
            principal.tenantId,
            id,
            "needs_attention",
            result.version,
            { scheduledAt: null, matchedRuleId: null },
          );
          await this.store.appendAudit(principal, "review.schedule_failed", "review", id);
        }
      }
      try {
        if (await this.notifications.reviewReady(principal, result))
          await this.store.appendAudit(principal, "notification.sent", "review", id);
      } catch {
        await this.store.appendAudit(principal, "notification.failed", "review", id);
      }
      return result;
    } catch (error) {
      const latest = await this.store.getReview(principal.tenantId, id);
      if (latest.status === "generating" && latest.version === generating.version)
        await this.store.transition(principal.tenantId, id, "needs_attention", latest.version);
      await this.store.appendAudit(principal, "draft.generation_failed", "review", id, {
        errorCode: error instanceof DomainError ? error.code : "provider_error",
      });
      throw error;
    }
  }
  async editDraft(
    principal: RequestPrincipal,
    id: string,
    expectedVersion: number,
    text: string,
  ): Promise<ReviewCase> {
    const review = await this.store.getReview(principal.tenantId, id);
    assertExpectedVersion(review, expectedVersion);
    if (
      !review.activeDraft ||
      !["pending_approval", "scheduled_auto", "needs_attention"].includes(review.status)
    )
      throw new DomainError("Draft cannot be edited in this state", "invalid_transition", 409);
    const result = await this.store.saveReview({
      ...review,
      activeDraft: { ...review.activeDraft, text, requiresHumanReview: true },
      validation: null,
      status: "pending_approval",
      scheduledAt: null,
      matchedRuleId: null,
      version: review.version + 1,
      updatedAt: new Date().toISOString(),
    });
    await this.store.appendAudit(principal, "draft.revised", "review", id, { manualEdit: true });
    return result;
  }
  async approve(
    principal: RequestPrincipal,
    id: string,
    expectedVersion: number,
    manual = true,
  ): Promise<ReviewCase> {
    let review = await this.store.getReview(principal.tenantId, id);
    const intent = await this.store.repository.get<PublishIntent>(
      principal.tenantId,
      "publish",
      id,
    );
    if (review.status === "published" && intent?.value.baseVersion === expectedVersion)
      return review;
    if (review.status === "publishing") {
      if (
        !intent ||
        (expectedVersion !== intent.value.baseVersion && expectedVersion !== review.version)
      )
        throw new DomainError("Publication cannot be reconciled", "publish_conflict", 409);
      if (Date.now() - intent.value.startedAt < 120_000)
        throw new DomainError("Publication is still in progress", "publication_busy", 503);
      return this.reconcile(principal, review, intent.value);
    }
    if (!manual && (review.status !== "scheduled_auto" || review.version !== expectedVersion))
      return review; // A cancelled/stale task is acknowledged without publishing.
    assertExpectedVersion(review, expectedVersion);
    if (!review.activeDraft) throw new DomainError("Review has no draft", "missing_draft", 409);
    if (manual && (!principal.mfaVerified || !["owner", "approver"].includes(principal.role)))
      throw new DomainError("MFA and an approver role are required", "mfa_required", 403);
    if (
      process.env.GOOGLE_MODE === "live" &&
      !(await this.store.listLocations(principal.tenantId)).some(
        (location) =>
          location.active &&
          location.id === review.snapshot.locationId &&
          review.snapshot.googleReviewName.startsWith(
            `${location.googleAccountName}/${location.googleLocationName}/reviews/`,
          ),
      )
    )
      throw new DomainError(
        "Collega nuovamente la sede prima di pubblicare",
        "google_location_disconnected",
        409,
      );
    const sources = await this.store.listKnowledge(principal.tenantId);
    if (
      review.activeDraft.knowledgeSourceIds.some((sourceId) => {
        const source = sources.find((entry) => entry.id === sourceId);
        return (
          !source ||
          source.status !== "approved" ||
          (review.knowledgeVersions?.[sourceId] !== undefined &&
            review.knowledgeVersions[sourceId] !== source.version) ||
          (source.locationId && source.locationId !== review.snapshot.locationId) ||
          (source.validFrom && Date.parse(source.validFrom) > Date.now()) ||
          (source.validUntil && Date.parse(source.validUntil) <= Date.now())
        );
      })
    )
      return this.store.transition(principal.tenantId, id, "needs_attention", review.version, {
        activeDraft: null,
        validation: null,
        scheduledAt: null,
        matchedRuleId: null,
      });
    if (!manual) {
      if (!review.scheduledAt || Date.parse(review.scheduledAt) > Date.now())
        throw new DomainError("Task arrived before scheduled delivery", "task_early", 503);
      const [rules, settings] = await Promise.all([
        this.store.listRules(principal.tenantId),
        this.store.getSettings(principal.tenantId),
      ]);
      const rule = rules.find((entry) => entry.id === review.matchedRuleId);
      const decision = review.validation
        ? decideAutomation({
            review,
            draft: review.activeDraft,
            validation: review.validation,
            rules: rule ? [rule] : [],
            approvedManualCount: await this.store.manualApprovalCount(
              principal.tenantId,
              review.snapshot.locationId,
            ),
            sentTodayByRule: await this.store.sentTodayByRule(
              principal.tenantId,
              rule ? [rule.id] : [],
            ),
            globalKillSwitch:
              settings.killSwitch || process.env.AUTOMATION_RELEASE_APPROVED !== "true",
          })
        : null;
      if (
        decision?.action !== "schedule_auto" ||
        !rule ||
        !(await this.store.reserveRuleSlot(principal.tenantId, rule.id, rule.dailyLimit))
      )
        return this.cancelSchedule(principal, id, review.version);
    }
    const value: PublishIntent = {
      text: review.activeDraft.text,
      baseVersion: expectedVersion,
      manual,
      startedAt: Date.now(),
    };
    review = await this.store.beginPublication(review, value, intent?.version ?? null);
    let writeAttempted = false;
    try {
      await this.store.appendAudit(principal, "review.approved", "review", id, { manual });
      await this.store.appendAudit(principal, "reply.publish_started", "review", id);
      const token = await this.currentAccessToken(principal.tenantId);
      const canonical = await this.google.getReview(token, review.snapshot.googleReviewName);
      if (canonical.updateTime !== review.snapshot.updateTime || canonical.existingReply)
        return this.invalidate(principal, review, canonical);
      writeAttempted = true;
      await this.google.updateReply(token, review.snapshot.googleReviewName, value.text);
      const confirmed = await this.google.getReview(token, review.snapshot.googleReviewName);
      if (confirmed.existingReply !== value.text)
        throw new DomainError(
          "Google publication is not confirmed",
          "publication_unconfirmed",
          503,
        );
      return this.confirmPublished(principal, review, value, confirmed.updateTime);
    } catch (error) {
      if (!writeAttempted) {
        const latest = await this.store.getReview(principal.tenantId, id);
        if (latest.status === "publishing" && latest.version === review.version)
          await this.store.transition(principal.tenantId, id, "needs_attention", latest.version, {
            scheduledAt: null,
            matchedRuleId: null,
          });
      }
      // Do not retry PUT after an uncertain response. Re-read Google before any subsequent action.
      await this.store.appendAudit(principal, "reply.publish_failed", "review", id, {
        errorCode: error instanceof DomainError ? error.code : "transport_error",
      });
      throw error;
    }
  }
  private async reconcile(principal: RequestPrincipal, review: ReviewCase, intent: PublishIntent) {
    const canonical = await this.google.getReview(
      await this.currentAccessToken(principal.tenantId),
      review.snapshot.googleReviewName,
    );
    if (canonical.existingReply === intent.text)
      return this.confirmPublished(principal, review, intent, canonical.updateTime);
    if (canonical.existingReply || canonical.updateTime !== review.snapshot.updateTime)
      return this.invalidate(principal, review, canonical);
    return this.store.transition(
      principal.tenantId,
      review.id,
      "pending_approval",
      review.version,
      { scheduledAt: null, matchedRuleId: null },
    );
  }
  private async confirmPublished(
    principal: RequestPrincipal,
    review: ReviewCase,
    intent: PublishIntent,
    time: string,
  ) {
    const result = await this.store.transition(
      principal.tenantId,
      review.id,
      "published",
      review.version,
      { publishedAt: time, publishedReply: intent.text, scheduledAt: null },
    );
    await this.store.appendAudit(principal, "reply.published", "review", review.id, {
      googleUpdateTime: time,
      confirmed: true,
    });
    await this.store.recordPublished(result, intent.manual);
    return result;
  }
  private async invalidate(
    principal: RequestPrincipal,
    review: ReviewCase,
    snapshot: ReviewSnapshot,
  ) {
    return this.store.transition(principal.tenantId, review.id, "needs_attention", review.version, {
      snapshot: { ...snapshot, locationId: review.snapshot.locationId },
      wasUpdated: true,
      activeDraft: null,
      validation: null,
      scheduledAt: null,
      matchedRuleId: null,
    });
  }
  async reject(principal: RequestPrincipal, id: string, expectedVersion: number, reason?: string) {
    const result = await this.store.transition(
      principal.tenantId,
      id,
      "rejected",
      expectedVersion,
      { scheduledAt: null, matchedRuleId: null },
    );
    await this.store.appendAudit(principal, "review.rejected", "review", id, {
      reasonProvided: Boolean(reason),
    });
    return result;
  }
  async cancelSchedule(principal: RequestPrincipal, id: string, expectedVersion: number) {
    const result = await this.store.transition(
      principal.tenantId,
      id,
      "pending_approval",
      expectedVersion,
      { scheduledAt: null, matchedRuleId: null },
    );
    await this.store.appendAudit(principal, "review.schedule_cancelled", "review", id);
    return result;
  }
  async currentAccessToken(tenantId: string): Promise<string> {
    const current = await this.store.getGoogleTokens(tenantId);
    if (!current) {
      if (process.env.GOOGLE_MODE !== "live" && process.env.NODE_ENV !== "production")
        return "demo-access-token";
      throw new DomainError("Connect Google before continuing", "google_disconnected", 401);
    }
    if (current.expiresAt > Date.now()) return current.accessToken;
    if (!current.refreshToken)
      throw new DomainError(
        "Google connection must be renewed",
        "google_reauthorization_required",
        401,
      );
    const refreshed = await this.google.refreshAccessToken(current.refreshToken);
    await this.store.setGoogleTokens(tenantId, refreshed);
    return refreshed.accessToken;
  }
}
