import type {
  AutomationDecision,
  AutomationRule,
  DraftValidation,
  ReplyDraft,
  ReviewCase,
  RiskFlag,
} from "@reviewguard/contracts";
import { detectHardStops, mergeRiskFlags } from "../security/hard-stops.js";

const nonOverridableFlags = new Set<RiskFlag>([
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

export interface AutomationContext {
  review: ReviewCase;
  draft: ReplyDraft;
  validation: DraftValidation;
  rules: readonly AutomationRule[];
  approvedManualCount: number;
  sentTodayByRule: Readonly<Record<string, number>>;
  now?: Date;
  globalKillSwitch?: boolean;
}

function matches(rule: AutomationRule, context: AutomationContext): boolean {
  const { review, draft } = context;
  const hasComment = review.snapshot.comment.trim().length > 0;
  return (
    rule.enabled &&
    rule.action === "schedule_auto" &&
    rule.consentVersion === "automation-consent-v1" &&
    Boolean(rule.consentedAt && rule.consentedBy) &&
    rule.starRatings.includes(review.snapshot.starRating) &&
    (rule.locationIds.length === 0 || rule.locationIds.includes(review.snapshot.locationId)) &&
    (rule.languages.length === 0 || rule.languages.includes(draft.language)) &&
    (rule.categories.length === 0 || rule.categories.includes(draft.category)) &&
    (rule.commentMode === "any" ||
      (rule.commentMode === "with_text" && hasComment) ||
      (rule.commentMode === "rating_only" && !hasComment))
  );
}

export function decideAutomation(context: AutomationContext): AutomationDecision {
  if (context.globalKillSwitch) {
    return manual("Global automation kill switch is active");
  }
  if (context.approvedManualCount < 20) {
    return manual(`Location needs ${20 - context.approvedManualCount} more manual approvals`);
  }
  if (!context.validation.valid || context.draft.requiresHumanReview) {
    return manual("AI draft or independent validation requires human review");
  }

  const hardStops = mergeRiskFlags(
    detectHardStops(context.review.snapshot),
    context.validation,
  ).filter((flag) => nonOverridableFlags.has(flag));
  if (
    context.draft.unsupportedClaims.length > 0 ||
    context.validation.unsupportedClaims.length > 0
  ) {
    hardStops.push("unsupported_claim");
  }
  if (hardStops.length > 0) {
    return manual("A non-overridable safety condition was detected", hardStops);
  }

  const rule = context.rules.find((candidate) => matches(candidate, context));
  if (!rule) {
    return manual("No enabled automation rule matches this review");
  }
  if ((context.sentTodayByRule[rule.id] ?? 0) >= rule.dailyLimit) {
    return manual("The automation rule reached its daily limit");
  }

  const scheduledAt = new Date((context.now ?? new Date()).getTime() + rule.delayMinutes * 60_000);
  return {
    action: "schedule_auto",
    matchedRuleId: rule.id,
    hardStops: [],
    reason: `Matched rule: ${rule.name}`,
    scheduledAt: scheduledAt.toISOString(),
  };
}

function manual(reason: string, hardStops: readonly string[] = []): AutomationDecision {
  return {
    action: "require_approval",
    matchedRuleId: null,
    hardStops: [...new Set(hardStops)],
    reason,
    scheduledAt: null,
  };
}
