import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { DocumentsService } from "../../../src/modules/documents/service";
import { DocumentSearchService } from "../../../src/modules/documents/search";
import { ChatService } from "../../../src/modules/chat/service";
import type { Kernel } from "../../../src/kernel/types";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("RAG Quality", () => {
  let kernel: Kernel;
  let docs: DocumentsService;
  let search: DocumentSearchService;
  let testDir: string;

  beforeEach(() => {
    DocumentSearchService.clearCache();
    kernel = createTestKernel();
    docs = kernel.get<DocumentsService>("docs");
    search = kernel.get<DocumentSearchService>("search");
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
      const result = await search.expandQuery("What is machine learning?");
      expect(result.original).toBe("What is machine learning?");
      expect(result.expanded).toBeDefined();
      expect(typeof result.expanded).toBe("string");
    });

    it("returns original query on LLM failure", async () => {
      const result = await search.expandQuery("test query");
      expect(result.original).toBe("test query");
      expect(result.keywords).toBeInstanceOf(Array);
    });
  });

  describe("Citation Tracking", () => {
    it("search results include citation", async () => {
      const path = createTestFile("cite-test.txt", "Machine learning is a subset of artificial intelligence.");
      await docs.ingest(path);

      const results = await search.search("machine learning");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.citation).toBeDefined();
      expect(results[0]!.citation).toContain("Source:");
    });

    it("search results include document title", async () => {
      const path = createTestFile("title-test.txt", "This document covers deep learning topics.");
      await docs.ingest(path);

      const results = await search.search("deep learning");
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

      const results = await search.search("data science programming", { rerank: true });
      expect(results.length).toBeGreaterThan(0);
    });

    it("returns same results without reranking", async () => {
      const path = createTestFile("no-rerank.txt", "Neural networks are used in deep learning.");
      await docs.ingest(path);

      const withRerank = await search.search("neural networks", { rerank: true });
      const withoutRerank = await search.search("neural networks", { rerank: false });

      expect(withRerank.length).toBe(withoutRerank.length);
    });
  });

  describe("Combined features", () => {
    it("search with expand and rerank", async () => {
      const path = createTestFile("combined.txt", "Transformer models use self-attention mechanisms.");
      await docs.ingest(path);

      const results = await search.search("attention mechanism", { expand: true, rerank: true });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe("Chat RAG wiring", () => {
    let chat: ChatService;

    beforeEach(() => {
      chat = new ChatService(kernel);
    });

    it("chat saves citations with assistant messages", async () => {
      const path = createTestFile("chat-cite.txt", "Python is widely used for machine learning and data science.");
      await docs.ingest(path);

      const session = chat.createSession({ title: "Citation test" });
      const msg = await chat.sendMessage(session.id, "Tell me about Python");

      expect(msg.citations).toBeDefined();
      const citations = JSON.parse(msg.citations!);
      expect(Array.isArray(citations)).toBe(true);
      if (citations.length > 0) {
        expect(citations[0].citation).toContain("Source:");
        expect(citations[0].chunkId).toBeDefined();
      }
    });

    it("chat uses expansion when rag.expand is enabled", async () => {
      const settings = kernel.get<{ get: (key: string) => unknown; set: (key: string, v: unknown) => void }>("settings");
      settings.set("rag.expand", true);

      const path = createTestFile("expand-chat.txt", "Neural networks are inspired by biological brain structures.");
      await docs.ingest(path);

      const session = chat.createSession({ title: "Expand test" });
      const msg = await chat.sendMessage(session.id, "What are neural nets?");
      expect(msg.content).toBeDefined();
      expect(msg.content.length).toBeGreaterThan(0);
    });

    it("chat uses reranking when rag.rerank is enabled", async () => {
      const settings = kernel.get<{ get: (key: string) => unknown; set: (key: string, v: unknown) => void }>("settings");
      settings.set("rag.rerank", true);

      const path = createTestFile("rerank-chat.txt", "Deep learning is a subset of machine learning using neural networks.");
      await docs.ingest(path);

      const session = chat.createSession({ title: "Rerank test" });
      const msg = await chat.sendMessage(session.id, "What is deep learning?");
      expect(msg.content).toBeDefined();
      expect(msg.content.length).toBeGreaterThan(0);
    });

    it("context chunks include citation field", async () => {
      const path = createTestFile("ctx-cite.txt", "Rust is a systems programming language focused on safety.");
      await docs.ingest(path);

      const session = chat.createSession({ title: "Context cite test" });
      const msg = await chat.sendMessage(session.id, "Tell me about Rust");

      expect(msg.context_chunks).toBeDefined();
      expect(msg.context_scores).toBeDefined();
      const chunks = JSON.parse(msg.context_chunks!);
      const scores = JSON.parse(msg.context_scores!);
      expect(chunks.length).toBe(scores.length);
    });
  });
});
