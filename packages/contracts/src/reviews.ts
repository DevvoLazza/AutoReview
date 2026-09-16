import { z } from "zod";
import { reviewWorkflowStatusSchema, riskFlagSchema } from "./enums.js";

export const reviewSnapshotSchema = z.object({
  googleReviewName: z.string().min(1),
  locationId: z.string().min(1),
  reviewerDisplayName: z.string().min(1).max(200),
  starRating: z.number().int().min(1).max(5),
  comment: z.string().max(10_000),
  languageHint: z.string().min(2).max(16).optional(),
  createTime: z.iso.datetime(),
  updateTime: z.iso.datetime(),
  existingReply: z.string().max(10_000).nullable().default(null),
});
export type ReviewSnapshot = z.infer<typeof reviewSnapshotSchema>;

export const replyDraftSchema = z.object({
  text: z.string().min(1).max(4_000),
  language: z.string().min(2).max(16),
  category: z.string().min(1).max(100),
  riskFlags: z.array(riskFlagSchema),
  knowledgeSourceIds: z.array(z.string().uuid()),
  unsupportedClaims: z.array(z.string().max(500)),
  requiresHumanReview: z.boolean(),
});
export type ReplyDraft = z.infer<typeof replyDraftSchema>;

export const draftValidationSchema = z.object({
  valid: z.boolean(),
  detectedLanguage: z.string().min(2).max(16),
  riskFlags: z.array(riskFlagSchema),
  unsupportedClaims: z.array(z.string().max(500)),
  reasons: z.array(z.string().max(500)),
});
export type DraftValidation = z.infer<typeof draftValidationSchema>;

export const reviewCaseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  snapshot: reviewSnapshotSchema,
  status: reviewWorkflowStatusSchema,
  version: z.number().int().positive(),
  activeDraft: replyDraftSchema.nullable(),
  validation: draftValidationSchema.nullable(),
  scheduledAt: z.iso.datetime().nullable(),
  matchedRuleId: z.string().uuid().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  publishedReply: z.string().max(4_000).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  contentExpiresAt: z.iso.datetime().optional(),
  wasUpdated: z.boolean().optional(),
  knowledgeVersions: z.record(z.string(), z.number().int().positive()).optional(),
});
export type ReviewCase = z.infer<typeof reviewCaseSchema>;

export const reviewListQuerySchema = z.object({
  status: reviewWorkflowStatusSchema.optional(),
  locationId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const revisionRequestSchema = z.object({
  instruction: z.string().min(2).max(2_000),
  expectedVersion: z.number().int().positive(),
});

export const editDraftRequestSchema = z.object({
  text: z.string().min(1).max(4_000),
  expectedVersion: z.number().int().positive(),
});

export const decisionRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().max(2_000).optional(),
});
