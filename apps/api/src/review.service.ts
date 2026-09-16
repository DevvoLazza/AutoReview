import { Inject, Injectable } from "@nestjs/common";
import type {
  RequestPrincipal,
  ReviewCase,
  ReviewListQuery,
  ReviewSnapshot,
} from "@reviewguard/contracts";
import {
  assertExpectedVersion,
  decideAutomation,
  detectHardStops,
  type GoogleBusinessGateway,
  type ReplyModelProvider,
} from "@reviewguard/core";
import { ReviewNotificationService } from "./notifications.js";
import { AI_PROVIDER, GOOGLE_GATEWAY } from "./providers.js";
import { MemoryStore } from "./store.js";
import { PublishTaskScheduler } from "./tasks.js";

@Injectable()
export class ReviewService {
  constructor(
    private readonly store: MemoryStore,
    @Inject(AI_PROVIDER) private readonly ai: ReplyModelProvider,
    @Inject(GOOGLE_GATEWAY) private readonly google: GoogleBusinessGateway,
    private readonly notifications: ReviewNotificationService,
    private readonly tasks: PublishTaskScheduler,
  ) {}

  list(principal: RequestPrincipal, filters: ReviewListQuery): ReviewCase[] {
    return this.store.listReviews(principal.tenantId, filters);
  }

  get(principal: RequestPrincipal, id: string): ReviewCase {
    return this.store.getReview(principal.tenantId, id);
  }

  async ingestAndGenerate(
    principal: RequestPrincipal,
    snapshot: ReviewSnapshot,
  ): Promise<ReviewCase> {
    const review = this.store.createReview(principal.tenantId, snapshot);
    this.store.appendAudit(principal, "review.received", "review", review.id, {
      googleReviewNameHash: await sha256(snapshot.googleReviewName),
    });
    return this.generate(principal, review.id, review.version);
  }

  async generate(
    principal: RequestPrincipal,
    id: string,
    expectedVersion: number,
    instruction?: string,
  ): Promise<ReviewCase> {
    const current = this.store.getReview(principal.tenantId, id);
    const generating = this.store.transition(principal.tenantId, id, "generating", expectedVersion);
    const knowledge = this.store
      .listKnowledge(principal.tenantId)
      .filter(
        (entry) =>
          entry.status === "approved" &&
          (!entry.locationId || entry.locationId === current.snapshot.locationId),
      )
      .slice(0, 8)
      .map((entry, index) => ({
        sourceId: entry.id,
        title: entry.title,
        content: entry.content.slice(0, 4_000),
        score: Math.max(0.1, 1 - index * 0.1),
        version: entry.version,
      }));
    const input = {
      review: current.snapshot,
      knowledge,
      defaultLanguage: current.snapshot.languageHint ?? "it",
      tone: "professionale, umano e conciso",
      instruction,
      previousDraft: current.activeDraft?.text,
    };
    const { generated, checked } = await (async () => {
      try {
        const generatedDraft = await this.ai.generateDraft(input);
        const checkedDraft = await this.ai.validateDraft({
          ...input,
          draft: generatedDraft.value,
        });
        return { generated: generatedDraft, checked: checkedDraft };
      } catch (error) {
        const latest = this.store.getReview(principal.tenantId, id);
        if (latest.status === "generating" && latest.version === generating.version) {
          this.store.transition(principal.tenantId, id, "needs_attention", generating.version);
        }
        this.store.appendAudit(principal, "draft.generation_failed", "review", id, {
          errorCode: error instanceof Error ? error.name : "unknown",
        });
        throw error;
      }
    })();
    const deterministicFlags = detectHardStops(current.snapshot);
    const validation = {
      ...checked.value,
      valid: checked.value.valid && deterministicFlags.length === 0,
      riskFlags: [...new Set([...checked.value.riskFlags, ...deterministicFlags])],
    };
    const draft = {
      ...generated.value,
      riskFlags: [...new Set([...generated.value.riskFlags, ...deterministicFlags])],
      requiresHumanReview:
        generated.value.requiresHumanReview || !validation.valid || deterministicFlags.length > 0,
    };

    const rules = this.store.listRules(principal.tenantId);
    const decision = instruction
      ? {
          action: "require_approval" as const,
          matchedRuleId: null,
          hardStops: [],
          scheduledAt: null,
          reason: "Human-requested revisions require approval",
        }
      : decideAutomation({
          review: generating,
          draft,
          validation,
          rules,
          approvedManualCount: this.store.manualApprovalCount(current.snapshot.locationId),
          sentTodayByRule: this.store.sentTodayByRule(rules.map((rule) => rule.id)),
        });
    const targetStatus =
      decision.action === "schedule_auto" ? "scheduled_auto" : "pending_approval";
    let result = this.store.transition(principal.tenantId, id, targetStatus, generating.version, {
      activeDraft: draft,
      validation,
      scheduledAt: decision.scheduledAt,
      matchedRuleId: decision.matchedRuleId,
    });
    this.store.appendAudit(
      principal,
      instruction ? "draft.revised" : "draft.generated",
      "review",
      id,
      {
        model: generated.model,
        provider: generated.provider,
        validationModel: checked.model,
        promptVersion: "reply-draft-v1",
        automationDecision: decision.action,
        riskFlags: draft.riskFlags,
      },
    );
    if (result.status === "scheduled_auto") {
      try {
        const task = await this.tasks.schedule(result, principal.userId);
        this.store.appendAudit(principal, "review.scheduled", "review", id, {
          scheduledAt: result.scheduledAt,
          matchedRuleId: result.matchedRuleId,
          taskName: task.taskName,
        });
      } catch (error) {
        result = this.store.transition(principal.tenantId, id, "needs_attention", result.version, {
          scheduledAt: null,
          matchedRuleId: null,
        });
        this.store.appendAudit(principal, "review.schedule_failed", "review", id, {
          errorCode: error instanceof Error ? error.name : "unknown",
        });
      }
    }
    try {
      const sent = await this.notifications.reviewReady(principal, result);
      if (sent)
        this.store.appendAudit(principal, "notification.sent", "review", id, {
          category: result.status,
        });
    } catch (error) {
      this.store.appendAudit(principal, "notification.failed", "review", id, {
        errorCode: error instanceof Error ? error.name : "unknown",
      });
    }
    return result;
  }

  editDraft(
    principal: RequestPrincipal,
    id: string,
    expectedVersion: number,
    text: string,
  ): ReviewCase {
    const review = this.store.getReview(principal.tenantId, id);
    if (!review.activeDraft) throw new Error("Review has no draft to edit");
    assertExpectedVersion(review, expectedVersion);
    return this.store.saveReview({
      ...review,
      activeDraft: { ...review.activeDraft, text, requiresHumanReview: true },
      status: "pending_approval",
      scheduledAt: null,
      matchedRuleId: null,
      version: review.version + 1,
      updatedAt: new Date().toISOString(),
    });
  }

  async approve(
    principal: RequestPrincipal,
    id: string,
    expectedVersion: number,
    manual = true,
  ): Promise<ReviewCase> {
    const review = this.store.getReview(principal.tenantId, id);
    if (!review.activeDraft) throw new Error("Review has no active draft");
    const publishing = this.store.transition(principal.tenantId, id, "publishing", expectedVersion);
    this.store.appendAudit(principal, "review.approved", "review", id);
    this.store.appendAudit(principal, "reply.publish_started", "review", id);
    try {
      const accessToken = await this.currentAccessToken(principal.tenantId);
      const canonical = await this.google.getReview(accessToken, review.snapshot.googleReviewName);
      if (canonical.updateTime !== review.snapshot.updateTime || canonical.existingReply) {
        return this.store.transition(
          principal.tenantId,
          id,
          "needs_attention",
          publishing.version,
          {
            snapshot: canonical,
            scheduledAt: null,
            matchedRuleId: null,
            validation: review.validation
              ? {
                  ...review.validation,
                  valid: false,
                  riskFlags: [
                    ...review.validation.riskFlags,
                    canonical.existingReply ? "existing_reply" : "review_updated",
                  ],
                }
              : null,
          },
        );
      }
      const published = await this.google.updateReply(
        accessToken,
        review.snapshot.googleReviewName,
        review.activeDraft.text,
      );
      const result = this.store.transition(
        principal.tenantId,
        id,
        "published",
        publishing.version,
        {
          publishedAt: published.updateTime,
          publishedReply: published.comment,
          scheduledAt: null,
        },
      );
      this.store.appendAudit(principal, "reply.published", "review", id, {
        googleUpdateTime: published.updateTime,
      });
      this.store.recordPublished(result, manual);
      return result;
    } catch (error) {
      const latest = this.store.getReview(principal.tenantId, id);
      if (latest.status === "publishing" && latest.version === publishing.version) {
        this.store.transition(principal.tenantId, id, "needs_attention", publishing.version, {
          scheduledAt: null,
          matchedRuleId: null,
        });
      }
      this.store.appendAudit(principal, "reply.publish_failed", "review", id, {
        errorCode: error instanceof Error ? error.name : "unknown",
      });
      throw error;
    }
  }

  reject(
    principal: RequestPrincipal,
    id: string,
    expectedVersion: number,
    reason?: string,
  ): ReviewCase {
    const result = this.store.transition(principal.tenantId, id, "rejected", expectedVersion, {
      scheduledAt: null,
      matchedRuleId: null,
    });
    this.store.appendAudit(principal, "review.rejected", "review", id, { reason: reason ?? null });
    return result;
  }

  cancelSchedule(principal: RequestPrincipal, id: string, expectedVersion: number): ReviewCase {
    const result = this.store.transition(
      principal.tenantId,
      id,
      "pending_approval",
      expectedVersion,
      { scheduledAt: null, matchedRuleId: null },
    );
    this.store.appendAudit(principal, "review.schedule_cancelled", "review", id);
    return result;
  }

  private async currentAccessToken(tenantId: string): Promise<string> {
    const current = this.store.getGoogleTokens(tenantId);
    if (!current) return "demo-access-token";
    if (current.expiresAt > Date.now()) return current.accessToken;
    if (!current.refreshToken) throw new Error("Google connection must be renewed");
    const refreshed = await this.google.refreshAccessToken(current.refreshToken);
    this.store.setGoogleTokens(tenantId, refreshed);
    return refreshed.accessToken;
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
