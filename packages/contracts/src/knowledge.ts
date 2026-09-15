import { z } from "zod";
import { knowledgeKindSchema, knowledgeStatusSchema } from "./enums.js";

export const knowledgeSourceSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  locationId: z.string().nullable(),
  kind: knowledgeKindSchema,
  title: z.string().min(2).max(200),
  content: z.string().min(1).max(250_000),
  language: z.string().min(2).max(16),
  status: knowledgeStatusSchema,
  version: z.number().int().positive(),
  validFrom: z.iso.datetime().nullable(),
  validUntil: z.iso.datetime().nullable(),
  authorId: z.string().uuid(),
  sha256: z.string().length(64),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export const createKnowledgeSourceSchema = knowledgeSourceSchema.pick({
  locationId: true,
  kind: true,
  title: true,
  content: true,
  language: true,
  validFrom: true,
  validUntil: true,
});

export const knowledgeExcerptSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string(),
  content: z.string().max(4_000),
  score: z.number().min(0).max(1),
  version: z.number().int().positive(),
});
export type KnowledgeExcerpt = z.infer<typeof knowledgeExcerptSchema>;
