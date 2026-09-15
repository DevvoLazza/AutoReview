import type { KnowledgeExcerpt, ReviewSnapshot } from "@reviewguard/contracts";

export interface KnowledgeRetriever {
  retrieve(input: {
    tenantId: string;
    locationId: string;
    review: ReviewSnapshot;
    limit?: number;
  }): Promise<KnowledgeExcerpt[]>;
}

export class InMemoryKnowledgeRetriever implements KnowledgeRetriever {
  constructor(private readonly entries: readonly KnowledgeExcerpt[]) {}

  async retrieve(input: {
    tenantId: string;
    locationId: string;
    review: ReviewSnapshot;
    limit?: number;
  }): Promise<KnowledgeExcerpt[]> {
    const terms = input.review.comment
      .toLowerCase()
      .split(/\W+/)
      .filter((term) => term.length > 3);
    return this.entries
      .map((entry) => ({
        ...entry,
        score: Math.max(
          entry.score,
          terms.filter((term) => entry.content.toLowerCase().includes(term)).length /
            Math.max(terms.length, 1),
        ),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, input.limit ?? 8);
  }
}
