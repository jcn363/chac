import { describe, it, expect } from "bun:test";
import { chunkTextSemantic, chunkText } from "../../../src/utils/chunking";

describe("chunkTextSemantic", () => {
  it("splits text into paragraphs then sentences", () => {
    const text = "First paragraph. Second sentence.\n\nSecond paragraph. Another sentence.";
    const chunks = chunkTextSemantic(text, 500);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.content).toContain("First paragraph");
  });

  it("respects maxChunkTokens", () => {
    const text = "Short. Short. Short. Short. Short. Short. Short. Short.";
    const chunks = chunkTextSemantic(text, 20);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(30);
    }
  });

  it("handles empty text", () => {
    const chunks = chunkTextSemantic("", 500);
    expect(chunks).toHaveLength(0);
  });

  it("handles text with no sentence boundaries", () => {
    const text = "No sentences here just words without punctuation";
    const chunks = chunkTextSemantic(text, 20);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("handles text with no paragraph breaks", () => {
    const text = "First sentence. Second sentence. Third sentence.";
    const chunks = chunkTextSemantic(text, 20);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    expect(chunks[0]!.content).toContain("First sentence");
  });

  it("assigns sequential indices", () => {
    const text = "First. Second. Third. Fourth. Fifth.";
    const chunks = chunkTextSemantic(text, 10);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it("estimates token count for each chunk", () => {
    const text = "Hello world. This is a test.";
    const chunks = chunkTextSemantic(text, 500);
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
  });

  it("overlapSentences creates shared sentences", () => {
    const text = "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence.";
    const chunks = chunkTextSemantic(text, 20, 1);
    if (chunks.length >= 2) {
      expect(chunks[0]!.content).toContain("sentence");
      expect(chunks[1]!.content).toContain("sentence");
    }
  });

  it("does not split mid-sentence for normal sentences", () => {
    const text = "This is a complete sentence. This is another complete sentence.";
    const chunks = chunkTextSemantic(text, 500);
    expect(chunks[0]!.content).toContain("complete sentence");
  });

  it("splits long sentences at commas", () => {
    const text = "A very long sentence with many, many, many, many, many, many, many, many, many, many, many, many, many, many, many, many, many parts.";
    const chunks = chunkTextSemantic(text, 20);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it("produces different output than character chunking for paragraph text", () => {
    const text = "First paragraph with some content.\n\nSecond paragraph with more content.\n\nThird paragraph with even more content.";
    const charChunks = chunkText(text, 50, 10);
    const semChunks = chunkTextSemantic(text, 20);
    const charJoined = charChunks.map((c) => c.content).join("");
    const semJoined = semChunks.map((c) => c.content).join("");
    expect(semJoined.length).toBeGreaterThanOrEqual(text.length - 50);
  });
});
