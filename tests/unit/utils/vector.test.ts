import { describe, it, expect } from "vitest";
import { cosineSimilarity, embeddingToBlob, blobToEmbedding } from "../../../src/utils/vector";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it("returns -1 for opposite vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it("handles zero vectors", () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([1, 1]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe("embeddingToBlob / blobToEmbedding", () => {
  it("roundtrips correctly", () => {
    const original = [0.1, 0.2, 0.3, -0.5];
    const blob = embeddingToBlob(original);
    const result = blobToEmbedding(blob);
    expect(result.length).toBe(4);
    for (let i = 0; i < original.length; i++) {
      expect(result[i]).toBeCloseTo(original[i], 5);
    }
  });

  it("handles empty arrays", () => {
    const blob = embeddingToBlob([]);
    const result = blobToEmbedding(blob);
    expect(result.length).toBe(0);
  });
});
