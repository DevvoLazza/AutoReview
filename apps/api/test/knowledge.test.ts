import { describe, expect, it } from "vitest";
import { chunkKnowledge } from "../src/knowledge.service.js";

describe("Section-aware bounded knowledge indexing", () => {
  it("keeps paragraph boundaries and limits embedding input size", () => {
    const content = `first section\n\n${"x".repeat(4000)}\n\nlast section`;
    const chunks = chunkKnowledge(content);
    expect(chunks.every((entry) => entry.length <= 1500)).toBe(true);
    expect(chunks.join("\n\n")).toContain("first section");
    expect(chunks.join("\n\n")).toContain("last section");
    expect(chunks.map((entry) => entry.match(/x/g)?.length ?? 0).reduce((a, b) => a + b, 0)).toBe(
      4000,
    );
  });
});
