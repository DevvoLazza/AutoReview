import { Injectable } from "@nestjs/common";
import type { KnowledgeSource, ReviewSnapshot } from "@reviewguard/contracts";
import { DomainError, InMemoryKnowledgeRetriever, VersionConflictError } from "@reviewguard/core";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import { MemoryStore } from "./store.js";

const embeddingResponse = z.object({
  predictions: z
    .array(
      z.object({
        embeddings: z.object({
          values: z.array(z.number().finite()).length(768),
          statistics: z.object({ truncated: z.boolean().optional() }).optional(),
        }),
      }),
    )
    .min(1),
});
export function chunkKnowledge(content: string): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const section of content.split(/\n\s*\n/)) {
    for (const piece of section.match(/[\s\S]{1,1500}/g) ?? []) {
      if (`${current}\n\n${piece}`.length > 1500 && current) {
        chunks.push(current);
        current = "";
      }
      current += (current ? "\n\n" : "") + piece;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}
@Injectable()
export class KnowledgeService {
  private readonly auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  private get model() {
    return process.env.EMBEDDING_MODEL ?? "gemini-embedding-001";
  }
  constructor(private readonly store: MemoryStore) {}
  private async embed(content: string, task: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY") {
    const region = process.env.EMBEDDING_LOCATION ?? "europe-west4";
    if (!/^[a-z0-9-]+$/.test(region) || !/^[a-z0-9-]+$/.test(this.model))
      throw new Error("Invalid embedding configuration");
    try {
      const response = await this.auth.request({
        url: `https://${region}-aiplatform.googleapis.com/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/${region}/publishers/google/models/${this.model}:predict`,
        method: "POST",
        data: {
          instances: [{ content, task_type: task }],
          parameters: { outputDimensionality: 768, autoTruncate: false },
        },
        timeout: 10_000,
        retry: false,
      });
      const value = embeddingResponse.parse(response.data).predictions[0]?.embeddings;
      if (!value || value.statistics?.truncated) throw new Error("Embedding was truncated");
      return value.values;
    } catch {
      throw new DomainError(
        "Ricerca semantica non disponibile: verifica Vertex AI, modello e quota, poi riprova",
        "embedding_failed",
        503,
      );
    }
  }
  async approve(tenantId: string, id: string, expectedVersion: number) {
    const source = (await this.store.listKnowledge(tenantId)).find((entry) => entry.id === id);
    if (!source || source.version !== expectedVersion)
      throw new VersionConflictError(expectedVersion, source?.version ?? 0);
    if (process.env.EMBEDDING_MODE === "vertex") {
      const chunks = chunkKnowledge(source.content);
      if (chunks.length > 48)
        throw new DomainError(
          "Dividi questa fonte in documenti più piccoli (massimo 48 sezioni da 1.500 caratteri) prima di approvarla",
          "knowledge_too_large",
          400,
        );
      const indexed: Array<{ content: string; embedding: number[]; model: string }> = new Array(
        chunks.length,
      );
      let cursor = 0;
      let failed = false;
      await Promise.all(
        Array.from({ length: Math.min(8, chunks.length) }, async () => {
          while (!failed && cursor < chunks.length) {
            const index = cursor++;
            const content = chunks[index];
            if (content) {
              try {
                indexed[index] = {
                  content,
                  embedding: await this.embed(content, "RETRIEVAL_DOCUMENT"),
                  model: this.model,
                };
              } catch (error) {
                failed = true;
                throw error;
              }
            }
          }
        }),
      );
      // Index the future version first. The query joins the live approved version, so stale edits never become visible.
      await this.store.repository.replaceKnowledgeChunks(
        tenantId,
        id,
        expectedVersion + 1,
        indexed,
      );
    }
    return this.store.approveKnowledge(tenantId, id, expectedVersion);
  }
  async retrieve(tenantId: string, review: ReviewSnapshot, sources: KnowledgeSource[]) {
    if (process.env.EMBEDDING_MODE === "vertex")
      return this.store.repository.searchKnowledge(
        tenantId,
        review.locationId,
        review.comment.slice(0, 1500) || `${review.starRating} star customer review`,
        await this.embed(
          review.comment.slice(0, 1500) || `${review.starRating} star customer review`,
          "RETRIEVAL_QUERY",
        ),
        this.model,
      );
    const now = Date.now();
    const entries = sources.filter(
      (entry) =>
        entry.status === "approved" &&
        (!entry.locationId || entry.locationId === review.locationId) &&
        (!entry.validFrom || Date.parse(entry.validFrom) <= now) &&
        (!entry.validUntil || Date.parse(entry.validUntil) > now),
    );
    return new InMemoryKnowledgeRetriever(
      entries.flatMap((entry) =>
        chunkKnowledge(entry.content).map((content) => ({
          sourceId: entry.id,
          title: entry.title,
          content,
          score: entry.kind === "policy" || entry.kind === "forbidden_claim" ? 1 : 0.15,
          version: entry.version,
        })),
      ),
    ).retrieve({ tenantId, locationId: review.locationId, review, limit: 12 });
  }
}
