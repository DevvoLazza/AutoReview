import type { ReviewCase } from "@reviewguard/contracts";
import { describe, expect, it } from "vitest";
import { InvalidTransitionError, transitionReview, VersionConflictError } from "../src/index.js";

const review: ReviewCase = {
  id: "46cf35af-1ad4-4d0a-a51f-d18358b3c05a",
  tenantId: "2d6fcf14-2c3a-487e-9f2b-b9d91297068e",
  snapshot: {
    googleReviewName: "accounts/1/locations/1/reviews/1",
    locationId: "1",
    reviewerDisplayName: "Mario",
    starRating: 5,
    comment: "Ottimo servizio",
    createTime: "2026-09-16T10:00:00.000Z",
    updateTime: "2026-09-16T10:00:00.000Z",
    existingReply: null,
  },
  status: "received",
  version: 1,
  activeDraft: null,
  validation: null,
  scheduledAt: null,
  matchedRuleId: null,
  publishedAt: null,
  publishedReply: null,
  createdAt: "2026-09-16T10:00:00.000Z",
  updatedAt: "2026-09-16T10:00:00.000Z",
};

describe("review workflow", () => {
  it("transitions with optimistic concurrency", () => {
    const generating = transitionReview(review, "generating", 1);
    expect(generating.version).toBe(2);
    expect(generating.status).toBe("generating");
  });

  it("rejects stale writes", () => {
    expect(() => transitionReview(review, "generating", 2)).toThrow(VersionConflictError);
  });

  it("rejects impossible transitions", () => {
    expect(() => transitionReview(review, "published", 1)).toThrow(InvalidTransitionError);
  });
});
