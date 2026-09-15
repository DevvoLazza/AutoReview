import type {
  DraftValidation,
  KnowledgeExcerpt,
  ReplyDraft,
  ReviewSnapshot,
} from "@reviewguard/contracts";

export interface DraftGenerationInput {
  review: ReviewSnapshot;
  knowledge: readonly KnowledgeExcerpt[];
  defaultLanguage: string;
  tone: string;
  instruction?: string;
  previousDraft?: string;
}

export interface ModelResult<T> {
  value: T;
  model: string;
  provider: string;
  requestId: string | null;
}

export interface ReplyModelProvider {
  generateDraft(input: DraftGenerationInput): Promise<ModelResult<ReplyDraft>>;
  validateDraft(
    input: DraftGenerationInput & { draft: ReplyDraft },
  ): Promise<ModelResult<DraftValidation>>;
}
