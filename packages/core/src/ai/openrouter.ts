import {
  type DraftValidation,
  draftValidationSchema,
  type ReplyDraft,
  replyDraftSchema,
} from "@reviewguard/contracts";
import { z } from "zod";
import { DomainError } from "../errors.js";
import { buildDraftPrompt, buildValidationPrompt } from "./prompts.js";
import type { DraftGenerationInput, ModelResult, ReplyModelProvider } from "./types.js";

interface OpenRouterOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  providerAllowlist?: readonly string[];
  fetchImpl?: typeof fetch;
}

const responseSchema = z.object({
  id: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  choices: z.array(
    z.object({
      message: z.object({ content: z.union([z.string(), z.array(z.unknown())]) }),
    }),
  ),
});

export class OpenRouterReplyProvider implements ReplyModelProvider {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly request: typeof fetch;

  constructor(private readonly options: OpenRouterOptions) {
    if (!options.apiKey) {
      throw new DomainError("OPENROUTER_API_KEY is required", "ai_not_configured", 503);
    }
    this.baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.model = options.model ?? "deepseek/deepseek-v4-pro-0813";
    this.request = options.fetchImpl ?? fetch;
  }

  async generateDraft(input: DraftGenerationInput): Promise<ModelResult<ReplyDraft>> {
    return this.call(buildDraftPrompt(input), "reply_draft", replyDraftSchema);
  }

  async validateDraft(
    input: DraftGenerationInput & { draft: ReplyDraft },
  ): Promise<ModelResult<DraftValidation>> {
    return this.call(buildValidationPrompt(input), "reply_validation", draftValidationSchema);
  }

  private async call<T>(
    prompt: string,
    schemaName: string,
    schema: z.ZodType<T>,
  ): Promise<ModelResult<T>> {
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
    const provider: Record<string, unknown> = {
      zdr: true,
      data_collection: "deny",
      require_parameters: true,
      allow_fallbacks: true,
    };
    if (this.options.providerAllowlist?.length) {
      provider.only = this.options.providerAllowlist;
    }

    const response = await this.request(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://reviewguard.invalid",
        "X-Title": "ReviewGuard",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content:
              "You create safe, grounded business review replies. Return only the requested structured output.",
          },
          { role: "user", content: prompt },
        ],
        reasoning: { effort: "low" },
        temperature: 0.2,
        max_tokens: 900,
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, strict: true, schema: jsonSchema },
        },
        provider,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new DomainError(
        `AI provider returned HTTP ${response.status}`,
        "ai_provider_error",
        502,
      );
    }

    const payload = responseSchema.parse(await response.json());
    const content = payload.choices[0]?.message.content;
    if (typeof content !== "string") {
      throw new DomainError("AI provider returned no structured text", "ai_invalid_response", 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new DomainError("AI provider returned invalid JSON", "ai_invalid_response", 502);
    }

    return {
      value: schema.parse(parsed),
      model: payload.model ?? this.model,
      provider: payload.provider ?? "openrouter",
      requestId: payload.id ?? null,
    };
  }
}

export class MockReplyProvider implements ReplyModelProvider {
  async generateDraft(input: DraftGenerationInput): Promise<ModelResult<ReplyDraft>> {
    const language = input.review.languageHint ?? input.defaultLanguage;
    const sourceIds = input.knowledge.map((source) => source.sourceId);
    const text = input.instruction
      ? `Grazie per il feedback. ${input.instruction.replace(/[<>]/g, "").slice(0, 180)}`
      : input.review.starRating >= 4
        ? "Grazie per aver condiviso la sua esperienza. Siamo felici che la visita sia stata positiva e speriamo di accoglierla di nuovo presto."
        : "Grazie per aver condiviso la sua esperienza. Ci dispiace che la visita non abbia soddisfatto le aspettative e desideriamo approfondire quanto accaduto.";
    return {
      value: {
        text,
        language,
        category: input.review.starRating >= 4 ? "praise" : "complaint",
        riskFlags: [],
        knowledgeSourceIds: sourceIds,
        unsupportedClaims: [],
        requiresHumanReview: input.review.starRating <= 3,
      },
      model: "mock-review-model-v1",
      provider: "local",
      requestId: null,
    };
  }

  async validateDraft(
    input: DraftGenerationInput & { draft: ReplyDraft },
  ): Promise<ModelResult<DraftValidation>> {
    return {
      value: {
        valid: input.draft.unsupportedClaims.length === 0,
        detectedLanguage: input.draft.language,
        riskFlags: input.draft.riskFlags,
        unsupportedClaims: input.draft.unsupportedClaims,
        reasons: [],
      },
      model: "mock-validator-v1",
      provider: "local",
      requestId: null,
    };
  }
}
