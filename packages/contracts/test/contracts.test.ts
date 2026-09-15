import { describe, expect, it } from "vitest";
import { automationRuleSchema, replyDraftSchema } from "../src/index.js";

describe("public contracts", () => {
  it("rejects an invalid star rating in a rule", () => {
    const result = automationRuleSchema.safeParse({
      id: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      name: "Invalid",
      locationIds: [],
      starRatings: [0],
      languages: [],
      commentMode: "any",
      categories: [],
      action: "schedule_auto",
      delayMinutes: 10,
      dailyLimit: 20,
      enabled: false,
      consentVersion: null,
      consentedBy: null,
      consentedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });

  it("accepts a grounded draft", () => {
    const draft = replyDraftSchema.parse({
      text: "Grazie per aver condiviso la sua esperienza.",
      language: "it",
      category: "general",
      riskFlags: [],
      knowledgeSourceIds: [crypto.randomUUID()],
      unsupportedClaims: [],
      requiresHumanReview: false,
    });

    expect(draft.language).toBe("it");
  });
});
