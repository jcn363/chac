import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { DocumentsService } from "../../../src/modules/documents/service";
import type { Kernel } from "../../../src/kernel/types";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("RAG Quality", () => {
  let kernel: Kernel;
  let docs: DocumentsService;
  let testDir: string;

  beforeEach(() => {
    kernel = createTestKernel();
    docs = new DocumentsService(kernel);
    testDir = join(import.meta.dir, "../../.test-rag");
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    kernel.get<{ close: () => void }>("db").close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestFile(name: string, content: string): string {
    const path = join(testDir, name);
    writeFileSync(path, content);
    return path;
  }

  describe("Query Expansion", () => {
    it("expands a query using LLM", async () => {
      const result = await docs.expandQuery("What is machine learning?");
      expect(result.original).toBe("What is machine learning?");
      expect(result.expanded).toBeDefined();
      expect(typeof result.expanded).toBe("string");
    });

    it("returns original query on LLM failure", async () => {
      const result = await docs.expandQuery("test query");
      expect(result.original).toBe("test query");
      expect(result.keywords).toBeInstanceOf(Array);
    });
  });

  describe("Citation Tracking", () => {
    it("search results include citation", async () => {
      const path = createTestFile("cite-test.txt", "Machine learning is a subset of artificial intelligence.");
      await docs.ingest(path);

      const results = await docs.search("machine learning");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.citation).toBeDefined();
      expect(results[0]!.citation).toContain("Source:");
    });

    it("search results include document title", async () => {
      const path = createTestFile("title-test.txt", "This document covers deep learning topics.");
      await docs.ingest(path);

      const results = await docs.search("deep learning");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.documentTitle).toBeDefined();
    });
  });

  describe("Reranking", () => {
    it("reranks results using LLM", async () => {
      const path1 = createTestFile("rerank1.txt", "Python is a programming language for data science.");
      const path2 = createTestFile("rerank2.txt", "JavaScript is used for web development.");
      const path3 = createTestFile("rerank3.txt", "Rust is a systems programming language.");

      await docs.ingest(path1);
      await docs.ingest(path2);
      await docs.ingest(path3);

      const results = await docs.search("data science programming", { rerank: true });
      expect(results.length).toBeGreaterThan(0);
    });

    it("returns same results without reranking", async () => {
      const path = createTestFile("no-rerank.txt", "Neural networks are used in deep learning.");
      await docs.ingest(path);

      const withRerank = await docs.search("neural networks", { rerank: true });
      const withoutRerank = await docs.search("neural networks", { rerank: false });

      expect(withRerank.length).toBe(withoutRerank.length);
    });
  });

  describe("Combined features", () => {
    it("search with expand and rerank", async () => {
      const path = createTestFile("combined.txt", "Transformer models use self-attention mechanisms.");
      await docs.ingest(path);

      const results = await docs.search("attention mechanism", { expand: true, rerank: true });
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
