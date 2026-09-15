import type { ReviewCase, ReviewWorkflowStatus } from "@reviewguard/contracts";
import { InvalidTransitionError, VersionConflictError } from "./errors.js";

const transitions: Record<ReviewWorkflowStatus, readonly ReviewWorkflowStatus[]> = {
  received: ["generating", "needs_attention"],
  generating: ["pending_approval", "scheduled_auto", "needs_attention"],
  pending_approval: ["generating", "publishing", "rejected", "needs_attention"],
  scheduled_auto: ["pending_approval", "publishing", "needs_attention"],
  publishing: ["published", "pending_approval", "needs_attention"],
  published: ["needs_attention"],
  rejected: ["generating"],
  needs_attention: ["generating", "pending_approval", "publishing", "rejected"],
};

export function assertExpectedVersion(review: ReviewCase, expectedVersion: number): void {
  if (review.version !== expectedVersion) {
    throw new VersionConflictError(expectedVersion, review.version);
  }
}

export function canTransition(from: ReviewWorkflowStatus, to: ReviewWorkflowStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function transitionReview(
  review: ReviewCase,
  to: ReviewWorkflowStatus,
  expectedVersion: number,
  patch: Partial<ReviewCase> = {},
): ReviewCase {
  assertExpectedVersion(review, expectedVersion);
  if (!canTransition(review.status, to)) {
    throw new InvalidTransitionError(review.status, to);
  }

  return {
    ...review,
    ...patch,
    id: review.id,
    tenantId: review.tenantId,
    status: to,
    version: review.version + 1,
    updatedAt: new Date().toISOString(),
  };
}
