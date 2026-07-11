import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../src/database/migrations";
import { SettingsService } from "../../src/modules/settings/service";
import { DocumentsService } from "../../src/modules/documents/service";
import { ChatService } from "../../src/modules/chat/service";
import { WikiService } from "../../src/modules/wiki/service";
import { MemoryService } from "../../src/modules/memory/service";
import { createMockLlmService } from "../mocks/llama-cpp";
import { createKernel } from "../../src/kernel";
import { chunkText, chunkTextSemantic } from "../../src/utils/chunking";
import { VectorIndex } from "../../src/utils/vector-index";
import { embeddingToBlob } from "../../src/utils/vector";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Kernel } from "../../src/kernel/types";

let kernel: Kernel;
let db: Database;
let testDir: string;

beforeEach(() => {
  kernel = createKernel();
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  kernel.provide("db", db);
  kernel.provide("settings", new SettingsService(db));
  kernel.provide("llm", createMockLlmService());
  kernel.provide("docs", new DocumentsService(kernel));
  kernel.provide("chat", new ChatService(kernel));
  kernel.provide("wiki", new WikiService(kernel));
  kernel.provide("memory", new MemoryService(kernel));

  testDir = join(import.meta.dir, "../../.bench-tmp");
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  db.close();
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function createTestFile(name: string, content: string): string {
  const path = join(testDir, name);
  writeFileSync(path, content);
  return path;
}

function makeEmbedding(values: number[]): Float32Array {
  return new Float32Array(values);
}

function insertItems(db: Database, count: number): void {
  db.exec("CREATE TABLE IF NOT EXISTS bench_items (id TEXT PRIMARY KEY, content TEXT, embedding BLOB)");
  for (let i = 0; i < count; i++) {
    const emb = Array.from({ length: 768 }, (_, j) => Math.sin(i + j * 0.01));
    const blob = embeddingToBlob(emb);
    db.query("INSERT INTO bench_items (id, content, embedding) VALUES (?, ?, ?)").run(
      String(i),
      `Item ${i} with some content for testing`,
      blob
    );
  }
}

describe("Performance Benchmarks", () => {
  describe("Chunking", () => {
    const text = "This is a sentence. ".repeat(1000);

    it("character chunking: 10K chars", () => {
      const start = performance.now();
      const chunks = chunkText(text, 500, 100);
      const elapsed = performance.now() - start;
      console.log(`  Character chunking: ${elapsed.toFixed(1)}ms for ${text.length} chars → ${chunks.length} chunks`);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("semantic chunking: 10K chars", () => {
      const start = performance.now();
      const chunks = chunkTextSemantic(text, 500);
      const elapsed = performance.now() - start;
      console.log(`  Semantic chunking: ${elapsed.toFixed(1)}ms for ${text.length} chars → ${chunks.length} chunks`);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("character chunking: 100K chars", () => {
      const bigText = "Word ".repeat(20000);
      const start = performance.now();
      const chunks = chunkText(bigText, 500, 100);
      const elapsed = performance.now() - start;
      console.log(`  Character chunking 100K: ${elapsed.toFixed(1)}ms → ${chunks.length} chunks`);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("semantic chunking: 100K chars", () => {
      const bigText = "Sentence. ".repeat(10000);
      const start = performance.now();
      const chunks = chunkTextSemantic(bigText, 500);
      const elapsed = performance.now() - start;
      console.log(`  Semantic chunking 100K: ${elapsed.toFixed(1)}ms → ${chunks.length} chunks`);
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe("Vector Search", () => {
    it("brute-force (100 vectors)", () => {
      insertItems(db, 100);
      const index = new VectorIndex();
      const query = makeEmbedding(Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.01)));

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        index.search(db, "bench_items", "id", "content", query, { limit: 10 });
      }
      const elapsed = (performance.now() - start) / 10;
      console.log(`  Brute-force (100): ${elapsed.toFixed(2)}ms per query`);
      expect(true).toBe(true);
    });

    it("brute-force (500 vectors)", () => {
      insertItems(db, 500);
      const index = new VectorIndex();
      const query = makeEmbedding(Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.01)));

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        index.search(db, "bench_items", "id", "content", query, { limit: 10 });
      }
      const elapsed = (performance.now() - start) / 10;
      console.log(`  Brute-force (500): ${elapsed.toFixed(2)}ms per query`);
      expect(true).toBe(true);
    });

    it("HNSW (200 vectors)", () => {
      insertItems(db, 200);
      const index = new VectorIndex();
      const query = makeEmbedding(Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.01)));

      // First call builds HNSW
      index.search(db, "bench_items", "id", "content", query, { limit: 10 });

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        index.search(db, "bench_items", "id", "content", query, { limit: 10 });
      }
      const elapsed = (performance.now() - start) / 10;
      console.log(`  HNSW (200): ${elapsed.toFixed(2)}ms per query`);
      expect(true).toBe(true);
    });

    it("HNSW (1000 vectors)", () => {
      insertItems(db, 1000);
      const index = new VectorIndex();
      const query = makeEmbedding(Array.from({ length: 768 }, (_, i) => Math.sin(i * 0.01)));

      // Build HNSW
      index.search(db, "bench_items", "id", "content", query, { limit: 10 });

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        index.search(db, "bench_items", "id", "content", query, { limit: 10 });
      }
      const elapsed = (performance.now() - start) / 10;
      console.log(`  HNSW (1000): ${elapsed.toFixed(2)}ms per query`);
      expect(true).toBe(true);
    });
  });

  describe("Memory Operations", () => {
    it("memory upsert 100 entries", () => {
      const memory = kernel.get<MemoryService>("memory");
      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        memory.upsert("preference", `key-${i}`, `value-${i}`);
      }
      const elapsed = performance.now() - start;
      console.log(`  Memory upsert 100: ${elapsed.toFixed(1)}ms`);
      expect(memory.list().length).toBe(100);
    });

    it("memory buildContextString with 100 entries", () => {
      const memory = kernel.get<MemoryService>("memory");
      for (let i = 0; i < 100; i++) {
        memory.upsert("preference", `key-${i}`, `value-${i}`);
      }
      const start = performance.now();
      const ctx = memory.buildContextString();
      const elapsed = performance.now() - start;
      console.log(`  Memory buildContextString 100: ${elapsed.toFixed(1)}ms`);
      expect(ctx.length).toBeGreaterThan(0);
    });
  });

  describe("RRF Fusion", () => {
    it("fusion with 50 results per source", () => {
      const k = 60;
      const source1 = Array.from({ length: 50 }, (_, i) => ({ id: `w${i}`, content: `wiki ${i}`, score: 1 / (k + i + 1) }));
      const source2 = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, content: `chunk ${i}`, score: 1 / (k + i + 1) }));

      const start = performance.now();
      const scores = new Map<string, { id: string; content: string; score: number }>();

      for (let rank = 0; rank < source1.length; rank++) {
        const r = source1[rank]!;
        const rrfScore = 1 / (k + rank + 1);
        scores.set(r.id, { id: r.id, content: r.content, score: rrfScore });
      }
      for (let rank = 0; rank < source2.length; rank++) {
        const r = source2[rank]!;
        const rrfScore = 1 / (k + rank + 1);
        const existing = scores.get(r.id);
        if (existing) {
          existing.score += rrfScore;
        } else {
          scores.set(r.id, { id: r.id, content: r.content, score: rrfScore });
        }
      }

      const fused = Array.from(scores.values());
      fused.sort((a, b) => b.score - a.score);
      const elapsed = performance.now() - start;
      console.log(`  RRF fusion 50+50: ${elapsed.toFixed(2)}ms → ${fused.length} results`);
      expect(fused.length).toBe(100);
    });
  });

  describe("End-to-End", () => {
    it("ingest 5 documents", async () => {
      const docs = kernel.get<DocumentsService>("docs");
      const start = performance.now();
      for (let i = 0; i < 5; i++) {
        const path = createTestFile(`doc-${i}.txt`, `Document ${i} about machine learning and artificial intelligence. `.repeat(100));
        await docs.ingest(path);
      }
      const elapsed = performance.now() - start;
      console.log(`  Ingest 5 docs: ${elapsed.toFixed(0)}ms`);
      expect(docs.list().total).toBe(5);
    });

    it.skip("compile wiki (skipped — mock LLM too slow)", async () => {
      const docs = kernel.get<DocumentsService>("docs");
      const wiki = kernel.get<WikiService>("wiki");
      const path = createTestFile(`wiki-doc.txt`, `Document about neural networks and deep learning. `.repeat(100));
      await docs.ingest(path);
      const start = performance.now();
      const pages = await wiki.compile();
      const elapsed = performance.now() - start;
      console.log(`  Wiki compile 1 doc: ${elapsed.toFixed(0)}ms → ${pages.length} pages`);
      expect(pages.length).toBeGreaterThanOrEqual(1);
    });

    it("full pipeline: ingest → compile → chat", async () => {
      const docs = kernel.get<DocumentsService>("docs");
      const wiki = kernel.get<WikiService>("wiki");
      const chat = kernel.get<ChatService>("chat");

      const path = createTestFile("pipeline.txt", "Python is a programming language. It is used for data science and web development. ");
      const start = performance.now();
      await docs.ingest(path);
      await wiki.compile();
      const session = chat.createSession();
      await chat.sendMessage(session.id, "What is Python?");
      const elapsed = performance.now() - start;
      console.log(`  Full pipeline: ${elapsed.toFixed(0)}ms`);
      expect(true).toBe(true);
    });
  });
});
