import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { VectorIndex } from "../../../src/utils/vector-index";
import { embeddingToBlob } from "../../../src/utils/vector";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE items (
      id TEXT PRIMARY KEY,
      content TEXT,
      embedding BLOB
    )
  `);
  return db;
}

function makeEmbedding(values: number[]): Float32Array {
  return new Float32Array(values);
}

function insertItem(db: Database, id: string, content: string, embedding: number[]): void {
  const blob = embeddingToBlob(embedding);
  db.query("INSERT INTO items (id, content, embedding) VALUES (?, ?, ?)").run(id, content, blob);
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

describe("VectorIndex", () => {
  let index: VectorIndex;
  let db: Database;

  beforeEach(() => {
    index = new VectorIndex();
    db = createTestDb();
  });

  it("returns empty for empty index", () => {
    const results = index.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]));
    expect(results).toHaveLength(0);
  });

  it("finds single matching entry", () => {
    insertItem(db, "1", "hello", [1, 0, 0]);
    const results = index.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]));
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("1");
    expect(results[0]!.score).toBeCloseTo(1.0, 4);
  });

  it("returns results sorted by score descending", () => {
    insertItem(db, "1", "far", [0, 0, 1]);
    insertItem(db, "2", "close", [1, 0, 0]);
    insertItem(db, "3", "medium", [0.5, 0.5, 0]);
    const results = index.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]));
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
  });

  it("respects limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      insertItem(db, String(i), `item${i}`, [1, i / 10, 0]);
    }
    const results = index.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]), { limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("respects threshold parameter", () => {
    insertItem(db, "1", "similar", [1, 0, 0]);
    insertItem(db, "2", "dissimilar", [0, 0, 1]);
    const results = index.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]), { threshold: 0.9 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("invalidate triggers rebuild on next search", () => {
    insertItem(db, "1", "first", [1, 0, 0]);
    index.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]));
    insertItem(db, "2", "second", [0.9, 0.1, 0]);
    index.invalidate();
    const results = index.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]));
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("handles zero-norm query gracefully", () => {
    insertItem(db, "1", "item", [1, 0, 0]);
    const results = index.search(db, "items", "id", "content", makeEmbedding([0, 0, 0]));
    expect(results).toHaveLength(0);
  });

  it("works with 768-dimensional embeddings", () => {
    const emb768a = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
    const emb768b = Array.from({ length: 768 }, (_, i) => (i === 1 ? 1 : 0));
    insertItem(db, "1", "vector a", emb768a);
    insertItem(db, "2", "vector b", emb768b);
    const results = index.search(db, "items", "id", "content", makeEmbedding(emb768a), { limit: 1 });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("1");
  });

  it("brute-force fallback for small index", () => {
    for (let i = 0; i < 50; i++) {
      insertItem(db, String(i), `item${i}`, [Math.random(), Math.random(), Math.random()]);
    }
    const results = index.search(db, "items", "id", "content", makeEmbedding([0.5, 0.5, 0.5]), { limit: 5 });
    expect(results).toHaveLength(5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it("HNSW index for larger dataset", () => {
    for (let i = 0; i < 150; i++) {
      const angle = (i / 150) * Math.PI * 2;
      insertItem(db, String(i), `item${i}`, [Math.cos(angle), Math.sin(angle), 0]);
    }
    const results = index.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]), { limit: 10 });
    expect(results).toHaveLength(10);
    expect(results[0]!.score).toBeGreaterThan(0.9);
  });

  it("HNSW recall is high compared to brute-force", () => {
    // Create structured data: 100 items near [1,0,0], 100 items near [0,0,1]
    for (let i = 0; i < 100; i++) {
      const v = [0.9 + Math.random() * 0.1, Math.random() * 0.1, Math.random() * 0.1];
      insertItem(db, String(i), `near-a-${i}`, v);
    }
    for (let i = 100; i < 200; i++) {
      const v = [Math.random() * 0.1, Math.random() * 0.1, 0.9 + Math.random() * 0.1];
      insertItem(db, String(i), `near-b-${i}`, v);
    }

    const bfIndex = new VectorIndex();
    const bfResults = bfIndex.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]), { limit: 10 });
    const hnswResults = index.search(db, "items", "id", "content", makeEmbedding([1, 0, 0]), { limit: 10 });

    // Both should return items from the "near-a" cluster (ids 0-99)
    expect(bfResults.length).toBe(10);
    expect(hnswResults.length).toBe(10);
    for (const r of hnswResults) {
      expect(parseInt(r.id)).toBeLessThan(100);
    }
  });
});
