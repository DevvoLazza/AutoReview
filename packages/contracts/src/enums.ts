import { z } from "zod";

export const roleSchema = z.enum(["owner", "admin", "editor", "approver"]);
export type Role = z.infer<typeof roleSchema>;

export const reviewWorkflowStatusSchema = z.enum([
  "received",
  "generating",
  "pending_approval",
  "scheduled_auto",
  "publishing",
  "published",
  "rejected",
  "needs_attention",
]);
export type ReviewWorkflowStatus = z.infer<typeof reviewWorkflowStatusSchema>;

export const knowledgeStatusSchema = z.enum(["draft", "approved", "retired"]);
export type KnowledgeStatus = z.infer<typeof knowledgeStatusSchema>;

export const knowledgeKindSchema = z.enum([
  "business_profile",
  "service",
  "opening_hours",
  "contact",
  "tone",
  "faq",
  "policy",
  "forbidden_claim",
  "document",
]);
export type KnowledgeKind = z.infer<typeof knowledgeKindSchema>;

export const riskFlagSchema = z.enum([
  "legal_threat",
  "safety_incident",
  "health_claim",
  "discrimination",
  "fraud",
  "refund_or_chargeback",
  "personal_data",
  "employee_accusation",
  "violence_or_threat",
  "unsupported_language",
  "insufficient_knowledge",
  "unsupported_claim",
  "prompt_injection",
  "review_updated",
  "existing_reply",
  "validator_disagreement",
]);
export type RiskFlag = z.infer<typeof riskFlagSchema>;

export const auditActionSchema = z.enum([
  "review.received",
  "draft.generated",
  "draft.generation_failed",
  "draft.revised",
  "review.approved",
  "review.rejected",
  "review.scheduled",
  "review.schedule_failed",
  "review.schedule_cancelled",
  "reply.publish_started",
  "reply.published",
  "reply.publish_failed",
  "rule.enabled",
  "rule.disabled",
  "knowledge.approved",
  "integration.connected",
  "integration.disconnected",
  "notification.sent",
  "notification.failed",
]);
export type AuditAction = z.infer<typeof auditActionSchema>;
