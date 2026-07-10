import { describe, it, expect } from "bun:test";
import { chunkText } from "../../../src/utils/chunking";

describe("chunkText", () => {
  it("chunks text into specified size", () => {
    const text = "a".repeat(1000);
    const chunks = chunkText(text, 500, 100);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]!.content.length).toBeLessThanOrEqual(500);
  });

  it("handles text shorter than chunk size", () => {
    const text = "Hello world";
    const chunks = chunkText(text, 500, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe("Hello world");
  });

  it("handles empty text", () => {
    const chunks = chunkText("", 500, 100);
    expect(chunks).toHaveLength(0);
  });

  it("creates overlapping chunks", () => {
    const text = "a".repeat(600);
    const chunks = chunkText(text, 300, 100);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // Second chunk should overlap with first
    const firstEnd = chunks[0]!.content.slice(-100);
    const secondStart = chunks[1]!.content.slice(0, 100);
    expect(firstEnd).toBe(secondStart);
  });

  it("assigns sequential indices", () => {
    const text = "a".repeat(1000);
    const chunks = chunkText(text, 300, 50);
    chunks.forEach((chunk, i) => {
      expect(chunk.index).toBe(i);
    });
  });

  it("estimates token count", () => {
    const text = "a".repeat(100);
    const chunks = chunkText(text, 100, 0);
    expect(chunks[0]!.tokenCount).toBe(25);
  });
});
