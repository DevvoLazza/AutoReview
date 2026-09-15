import { z } from "zod";

export const automationRuleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(2).max(120),
  locationIds: z.array(z.string()).default([]),
  starRatings: z.array(z.number().int().min(1).max(5)).min(1),
  languages: z.array(z.string().min(2).max(16)).default([]),
  commentMode: z.enum(["any", "with_text", "rating_only"]).default("any"),
  categories: z.array(z.string().max(100)).default([]),
  action: z.enum(["require_approval", "schedule_auto"]),
  delayMinutes: z.number().int().min(10).max(10_080).default(10),
  dailyLimit: z.number().int().min(1).max(1_000).default(20),
  enabled: z.boolean().default(false),
  consentVersion: z.string().min(1).nullable(),
  consentedBy: z.string().uuid().nullable(),
  consentedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AutomationRule = z.infer<typeof automationRuleSchema>;

export const automationDecisionSchema = z.object({
  action: z.enum(["require_approval", "schedule_auto"]),
  matchedRuleId: z.string().uuid().nullable(),
  hardStops: z.array(z.string()),
  reason: z.string(),
  scheduledAt: z.iso.datetime().nullable(),
});
export type AutomationDecision = z.infer<typeof automationDecisionSchema>;

export const createAutomationRuleSchema = automationRuleSchema.omit({
  id: true,
  tenantId: true,
  consentVersion: true,
  consentedBy: true,
  consentedAt: true,
  createdAt: true,
  updatedAt: true,
});

export const enableAutomationRuleSchema = z.object({
  expectedConsentVersion: z.literal("automation-consent-v1"),
  mfaVerified: z.literal(true),
});
