import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../../src/database/migrations";
import { createMockLlmService } from "../../mocks/llama-cpp";
import {
  createEmbedding,
  collectLlmResponse,
  extractJsonFromLlm,
  embedAndInsertChunks,
  estimateTokens,
} from "../../../src/utils/llm-helpers";
import type { LlmService } from "../../../src/modules/llm/types";

let db: Database;
let llm: LlmService;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  llm = createMockLlmService();
});

describe("createEmbedding", () => {
  it("returns a Float32Array from the LLM", async () => {
    const embedding = await createEmbedding(llm, "hello world");
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(768);
  });

  it("throws when LLM returns no embedding", async () => {
    const badLlm = {
      ...llm,
      embeddings: {
        async create() {
          return { data: [] };
        },
      },
    };
    await expect(createEmbedding(badLlm as LlmService, "test")).rejects.toThrow("No embedding returned");
  });

  it("produces different embeddings for different inputs", async () => {
    const emb1 = await createEmbedding(llm, "hello");
    const emb2 = await createEmbedding(llm, "world");
    const same = emb1.every((v, i) => v === emb2[i]);
    expect(same).toBe(false);
  });
});

describe("collectLlmResponse", () => {
  it("collects streaming chunks into a single string", async () => {
    const result = await collectLlmResponse(llm, [
      { role: "user", content: "What is 2+2?" },
    ]);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain("Mock response");
  });

  it("handles empty messages array gracefully", async () => {
    // The mock throws for empty messages, which is expected behavior
    await expect(collectLlmResponse(llm, [])).rejects.toThrow();
  });

  it("concatenates multiple chunks correctly", async () => {
    const result = await collectLlmResponse(llm, [
      { role: "user", content: "hello" },
    ]);
    // Mock yields words with spaces, so result should have spaces
    expect(result).toMatch(/\s/);
  });
});

describe("extractJsonFromLlm", () => {
  it("extracts JSON matching a regex pattern", () => {
    const response = 'Here is the result: {"key": "value", "count": 42}';
    const result = extractJsonFromLlm<{ key: string; count: number }>(
      response,
      /\{[^}]+\}/,
    );
    expect(result).toEqual({ key: "value", count: 42 });
  });

  it("returns null when no match found", () => {
    const result = extractJsonFromLlm("no json here", /\{[^}]+\}/);
    expect(result).toBeNull();
  });

  it("returns null when matched text is not valid JSON", () => {
    const result = extractJsonFromLlm("{not valid json}", /\{[^}]+\}/);
    expect(result).toBeNull();
  });

  it("extracts first match when multiple exist", () => {
    const response = '{"a": 1} some text {"b": 2}';
    const result = extractJsonFromLlm<{ a: number }>(response, /\{[^}]+\}/);
    expect(result).toEqual({ a: 1 });
  });

  it("handles complex nested JSON", () => {
    const response = 'Result: {"items": [1, 2, 3], "nested": {"deep": true}}';
    const result = extractJsonFromLlm<{ items: number[]; nested: { deep: boolean } }>(
      response,
      /\{[\s\S]*\}/,
    );
    expect(result).toEqual({ items: [1, 2, 3], nested: { deep: true } });
  });

  it("returns null for empty string", () => {
    expect(extractJsonFromLlm("", /\{[^}]+\}/)).toBeNull();
  });
});

describe("embedAndInsertChunks", () => {
  it("inserts chunks with embeddings into the database", async () => {
    // First insert a document
    db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run(
      "doc1", "Test Doc", "hash1", 2,
    );

    const chunks = [
      { index: 0, content: "First chunk of text", tokenCount: 5 },
      { index: 1, content: "Second chunk of text", tokenCount: 5 },
    ];

    await embedAndInsertChunks(db, chunks, "doc1", llm);

    // Use .get() for single-row check, then .all() for full verification
    const count = db.query("SELECT COUNT(*) as c FROM chunks WHERE document_id = ?").get("doc1") as { c: number };
    expect(count.c).toBe(2);

    const first = db.query("SELECT content, chunk_index FROM chunks WHERE document_id = ? AND chunk_index = 0").get("doc1") as { content: string; chunk_index: number };
    expect(first.content).toBe("First chunk of text");
    expect(first.chunk_index).toBe(0);
  });

  it("processes more than BATCH_SIZE (8) chunks correctly", async () => {
    db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run(
      "doc1", "Test Doc", "hash1", 12,
    );

    const chunks = Array.from({ length: 12 }, (_, i) => ({
      index: i,
      content: `Chunk ${i} content`,
      tokenCount: 3,
    }));

    await embedAndInsertChunks(db, chunks, "doc1", llm);

    const count = db.query("SELECT COUNT(*) as count FROM chunks WHERE document_id = ?").get("doc1") as { count: number };
    expect(count.count).toBe(12);
  });

  it("handles single chunk", async () => {
    db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run(
      "doc1", "Test Doc", "hash1", 1,
    );

    await embedAndInsertChunks(db, [{ index: 0, content: "Only chunk", tokenCount: 2 }], "doc1", llm);

    const count = db.query("SELECT COUNT(*) as count FROM chunks WHERE document_id = ?").get("doc1") as { count: number };
    expect(count.count).toBe(1);
  });

  it("throws when LLM returns no embedding for a chunk", async () => {
    db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run(
      "doc1", "Test Doc", "hash1", 1,
    );

    const badLlm = {
      ...llm,
      embeddings: {
        async create() {
          return { data: [] };
        },
      },
    };

    await expect(
      embedAndInsertChunks(db, [{ index: 0, content: "test", tokenCount: 1 }], "doc1", badLlm as LlmService),
    ).rejects.toThrow("No embedding returned");
  });
});

describe("estimateTokens", () => {
  it("returns ceil(length/4)", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("a")).toBe(1);
    expect(estimateTokens("ab")).toBe(1);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });

  it("handles typical text", () => {
    expect(estimateTokens("Hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
  });

  it("handles long text", () => {
    const longText = "a".repeat(1000);
    expect(estimateTokens(longText)).toBe(250);
  });
});
