import type { DraftValidation, ReviewSnapshot, RiskFlag } from "@reviewguard/contracts";

const patterns: ReadonlyArray<{ flag: RiskFlag; pattern: RegExp }> = [
  {
    flag: "legal_threat",
    pattern: /\b(avvocat[oi]|denunci[ao]|querel[ao]|legal action|lawsuit|court)\b/i,
  },
  {
    flag: "safety_incident",
    pattern: /\b(incidente|infortunio|pericol[oa]|unsafe|injur(?:y|ed))\b/i,
  },
  {
    flag: "health_claim",
    pattern: /\b(malattia|intossicazione|allergia|ospedale|sick|poison|allerg)\b/i,
  },
  { flag: "discrimination", pattern: /\b(discrimin|razzis|racis|omofob|sexist)\w*/i },
  { flag: "fraud", pattern: /\b(truffa|frode|fraud|scam|rubat[oa]|stolen)\b/i },
  { flag: "refund_or_chargeback", pattern: /\b(rimborso|chargeback|refund|storno)\b/i },
  {
    flag: "employee_accusation",
    pattern:
      /\b(dipendente|cameriere|staff|employee|manager)\b.{0,40}\b(aggredit|rubat|insultat|threat|steal|assault)/i,
  },
  { flag: "violence_or_threat", pattern: /\b(minacci|violenza|aggredit|kill|threat|attack)\w*/i },
  {
    flag: "personal_data",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b(?:\+?39[ .-]?)?(?:\d[ .-]?){9,10}\b/i,
  },
];

const injectionPatterns = [
  /ignore (all |the )?(previous|prior) instructions/i,
  /system prompt/i,
  /developer message/i,
  /you are now/i,
  /reveal (your|the) instructions/i,
  /non seguire (le )?istruzioni/i,
];

export function detectHardStops(review: ReviewSnapshot): RiskFlag[] {
  const flags = patterns
    .filter(({ pattern }) => pattern.test(review.comment))
    .map(({ flag }) => flag);

  if (injectionPatterns.some((pattern) => pattern.test(review.comment))) {
    flags.push("prompt_injection");
  }
  if (review.existingReply) {
    flags.push("existing_reply");
  }

  return [...new Set(flags)];
}

export function mergeRiskFlags(
  deterministic: readonly RiskFlag[],
  modelValidation: DraftValidation,
): RiskFlag[] {
  return [...new Set([...deterministic, ...modelValidation.riskFlags])];
}
