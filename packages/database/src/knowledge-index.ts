export type IndexedKnowledgeChunk = { content: string; embedding: number[]; model: string };
export function vectorParameter(value: readonly number[]) {
  if (
    value.length !== 768 ||
    value.some((entry) => !Number.isFinite(entry)) ||
    value.every((entry) => entry === 0)
  )
    throw new Error("Embeddings require 768 finite, non-zero dimensions");
  return `[${value.join(",")}]`;
}
