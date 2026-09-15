import type {
  AutomationRule,
  KnowledgeSource,
  ReplyDraft,
  ReviewCase,
  ReviewSnapshot,
} from "@reviewguard/contracts";

export const DEMO_TENANT_ID = "11111111-1111-4111-8111-111111111111";
export const DEMO_USER_ID = "22222222-2222-4222-8222-222222222222";
export const DEMO_LOCATION_ID = "33333333-3333-4333-8333-333333333333";

const timestamp = "2026-09-16T09:30:00.000Z";

export const DEMO_SNAPSHOTS = [
  {
    googleReviewName: "accounts/demo/locations/demo/reviews/review-positive",
    locationId: DEMO_LOCATION_ID,
    reviewerDisplayName: "Giulia R.",
    starRating: 5,
    comment: "Servizio impeccabile, personale gentile e ambiente molto curato.",
    languageHint: "it",
    createTime: timestamp,
    updateTime: timestamp,
    existingReply: null,
  },
  {
    googleReviewName: "accounts/demo/locations/demo/reviews/review-neutral",
    locationId: DEMO_LOCATION_ID,
    reviewerDisplayName: "Lucas M.",
    starRating: 3,
    comment: "The service was friendly but the waiting time was longer than expected.",
    languageHint: "en",
    createTime: "2026-09-16T08:05:00.000Z",
    updateTime: "2026-09-16T08:05:00.000Z",
    existingReply: null,
  },
  {
    googleReviewName: "accounts/demo/locations/demo/reviews/review-risk",
    locationId: DEMO_LOCATION_ID,
    reviewerDisplayName: "Andrea P.",
    starRating: 1,
    comment: "Chiederò il rimborso e sentirò il mio avvocato per quanto accaduto.",
    languageHint: "it",
    createTime: "2026-09-15T18:20:00.000Z",
    updateTime: "2026-09-15T18:20:00.000Z",
    existingReply: null,
  },
] as const satisfies readonly ReviewSnapshot[];

const positiveDraft: ReplyDraft = {
  text: "Grazie Giulia per le belle parole. Siamo felici che abbia apprezzato l'accoglienza e la cura dell'ambiente. Speriamo di rivederla presto.",
  language: "it",
  category: "praise",
  riskFlags: [],
  knowledgeSourceIds: ["44444444-4444-4444-8444-444444444444"],
  unsupportedClaims: [],
  requiresHumanReview: false,
};

function reviewCase(
  id: string,
  snapshot: ReviewSnapshot,
  status: ReviewCase["status"],
  draft: ReplyDraft | null,
  version: number,
): ReviewCase {
  return {
    id,
    tenantId: DEMO_TENANT_ID,
    snapshot,
    status,
    version,
    activeDraft: draft,
    validation: draft
      ? {
          valid: draft.riskFlags.length === 0,
          detectedLanguage: draft.language,
          riskFlags: draft.riskFlags,
          unsupportedClaims: [],
          reasons: [],
        }
      : null,
    scheduledAt: null,
    matchedRuleId: null,
    publishedAt: null,
    publishedReply: null,
    createdAt: snapshot.createTime,
    updatedAt: snapshot.updateTime,
  };
}

export const DEMO_REVIEWS: ReviewCase[] = [
  reviewCase(
    "55555555-5555-4555-8555-555555555551",
    DEMO_SNAPSHOTS[0],
    "pending_approval",
    positiveDraft,
    3,
  ),
  reviewCase("55555555-5555-4555-8555-555555555552", DEMO_SNAPSHOTS[1], "received", null, 1),
  reviewCase("55555555-5555-4555-8555-555555555553", DEMO_SNAPSHOTS[2], "needs_attention", null, 2),
];

export const DEMO_KNOWLEDGE: KnowledgeSource[] = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    tenantId: DEMO_TENANT_ID,
    locationId: DEMO_LOCATION_ID,
    kind: "tone",
    title: "Tono del brand",
    content:
      "Rispondere in modo professionale, umano e conciso. Ringraziare senza usare formule eccessive.",
    language: "it",
    status: "approved",
    version: 1,
    validFrom: null,
    validUntil: null,
    authorId: DEMO_USER_ID,
    sha256: "a".repeat(64),
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: "44444444-4444-4444-8444-444444444445",
    tenantId: DEMO_TENANT_ID,
    locationId: DEMO_LOCATION_ID,
    kind: "policy",
    title: "Gestione reclami",
    content:
      "Per reclami o rimborsi non promettere compensazioni. Invitare il cliente a contattare privatamente la direzione.",
    language: "it",
    status: "approved",
    version: 1,
    validFrom: null,
    validUntil: null,
    authorId: DEMO_USER_ID,
    sha256: "b".repeat(64),
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

export const DEMO_RULES: AutomationRule[] = [
  {
    id: "66666666-6666-4666-8666-666666666666",
    tenantId: DEMO_TENANT_ID,
    name: "Recensioni positive verificate",
    locationIds: [DEMO_LOCATION_ID],
    starRatings: [4, 5],
    languages: ["it", "en"],
    commentMode: "any",
    categories: ["praise"],
    action: "schedule_auto",
    delayMinutes: 10,
    dailyLimit: 20,
    enabled: false,
    consentVersion: null,
    consentedBy: null,
    consentedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];
