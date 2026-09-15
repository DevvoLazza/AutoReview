import { describe, expect, it, vi } from "vitest";
import { OpenRouterReplyProvider } from "../src/index.js";

describe("OpenRouter safety envelope", () => {
  it("pins the model, structured schema, ZDR and provider data denial", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: "request-1",
            provider: "verified-provider",
            model: "deepseek/deepseek-v4-pro-0813",
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    text: "Grazie per aver condiviso la sua esperienza.",
                    language: "it",
                    category: "general",
                    riskFlags: [],
                    knowledgeSourceIds: [],
                    unsupportedClaims: [],
                    requiresHumanReview: false,
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const provider = new OpenRouterReplyProvider({
      apiKey: "test-only",
      providerAllowlist: ["verified-provider"],
      fetchImpl: fetchImpl as typeof fetch,
    });

    await provider.generateDraft({
      review: {
        googleReviewName: "accounts/1/locations/2/reviews/3",
        locationId: "2",
        reviewerDisplayName: "Cliente",
        starRating: 5,
        comment: "Ottimo servizio",
        languageHint: "it",
        createTime: "2026-09-16T00:00:00.000Z",
        updateTime: "2026-09-16T00:00:00.000Z",
        existingReply: null,
      },
      knowledge: [],
      defaultLanguage: "it",
      tone: "professionale",
    });

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)) as {
      model: string;
      response_format: { type: string };
      provider: Record<string, unknown>;
    };
    expect(body.model).toBe("deepseek/deepseek-v4-pro-0813");
    expect(body.response_format.type).toBe("json_schema");
    expect(body.provider).toMatchObject({
      zdr: true,
      data_collection: "deny",
      require_parameters: true,
      order: ["verified-provider"],
    });
  });
});
