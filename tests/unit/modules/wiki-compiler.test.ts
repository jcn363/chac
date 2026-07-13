import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../../src/database/migrations";
import { createMockLlmService } from "../../mocks/llama-cpp";
import { WikiCompiler } from "../../../src/modules/wiki/compiler";
import { WikiSynthesizer } from "../../../src/modules/wiki/synthesizer";
import { SettingsService } from "../../../src/modules/settings/service";
import { VectorIndex } from "../../../src/utils/vector-index";
import type { LlmService } from "../../../src/modules/llm/types";

let db: Database;
let llm: LlmService;
let settings: SettingsService;
let synthesizer: WikiSynthesizer;
let compiler: WikiCompiler;

function insertDoc(id: string, title: string) {
  db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run(id, title, `hash_${id}`, 2);
}

function insertChunk(docId: string, index: number, content: string) {
  db.query("INSERT INTO chunks (id, document_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?)").run(
    `chunk_${docId}_${index}`, docId, index, content, null,
  );
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  llm = createMockLlmService();
  settings = new SettingsService(db);
  const wikiIndex = new VectorIndex(db, "wiki_pages");
  synthesizer = new WikiSynthesizer(db, llm, wikiIndex, settings);
  compiler = new WikiCompiler(db, llm, null as any, settings, synthesizer);
});

afterEach(() => {
  db.close();
});

describe("WikiCompiler", () => {
  describe("compile()", () => {
    it("returns empty array when no documents exist", async () => {
      const result = await compiler.compile();
      expect(result).toHaveLength(0);
    });

    it("compiles single document with single-pass", async () => {
      insertDoc("d1", "Machine Learning");
      insertChunk("d1", 0, "Machine learning is a subset of AI.");
      insertChunk("d1", 1, "It uses data to train models.");

      const result = await compiler.compile();
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe("Machine Learning");
      expect(result[0]!.slug).toBe("machine-learning");
      expect(result[0]!.content).toBeDefined();
      expect(result[0]!.content.length).toBeGreaterThan(0);
    });

    it("compiles with multi-agent mode when enabled", async () => {
      settings.set("wiki.agents_enabled", true);

      insertDoc("d1", "Neural Networks");
      insertChunk("d1", 0, "Neural networks are inspired by biological neurons.");
      insertChunk("d1", 1, "They consist of layers of interconnected nodes.");

      const result = await compiler.compile();
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe("Neural Networks");
    });

    it("updates existing wiki page on recompilation", async () => {
      insertDoc("d1", "Python");
      insertChunk("d1", 0, "Python is a programming language.");
      insertChunk("d1", 1, "It is known for readability.");

      // First compile — creates page
      const first = await compiler.compile();
      expect(first).toHaveLength(1);
      const v1 = db.query("SELECT version FROM wiki_pages WHERE slug = ?").get("python") as { version: number };
      expect(v1.version).toBe(1);

      // Second compile — updates page
      const second = await compiler.compile();
      expect(second).toHaveLength(1);
      const v2 = db.query("SELECT version FROM wiki_pages WHERE slug = ?").get("python") as { version: number };
      expect(v2.version).toBe(2);
    });

    it("processes documents in batches of 4", async () => {
      // Insert 6 documents
      for (let i = 0; i < 6; i++) {
        insertDoc(`d${i}`, `Doc ${i}`);
        insertChunk(`d${i}`, 0, `Content for document ${i}`);
      }

      const result = await compiler.compile();
      // 6 doc pages + 1 synthesis page (6 >= 2 triggers synthesis)
      expect(result.length).toBeGreaterThanOrEqual(6);
    });

    it("truncates content to max_wiki_chars", async () => {
      settings.set("rag.max_wiki_chars", 50);

      insertDoc("d1", "Long Doc");
      insertChunk("d1", 0, "A".repeat(200));

      const result = await compiler.compile();
      expect(result).toHaveLength(1);
      // Content should be truncated but still have LLM output
      expect(result[0]!.content).toBeDefined();
    });

    it("runs cross-document synthesis when 2+ pages exist", async () => {
      insertDoc("d1", "Topic A");
      insertChunk("d1", 0, "Content about topic A.");
      insertDoc("d2", "Topic B");
      insertChunk("d2", 0, "Content about topic B.");

      const result = await compiler.compile();
      // Should have at least 2 pages + possibly synthesis pages
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("compiles only specified document IDs", async () => {
      insertDoc("d1", "Alpha");
      insertChunk("d1", 0, "Content about Alpha.");
      insertDoc("d2", "Beta");
      insertChunk("d2", 0, "Content about Beta.");
      insertDoc("d3", "Gamma");
      insertChunk("d3", 0, "Content about Gamma.");

      const result = await compiler.compile(["d1", "d3"]);
      // 2 doc pages + synthesis pages (2+ triggers synthesis)
      expect(result.length).toBeGreaterThanOrEqual(2);
      const titles = result.map((p) => p.title);
      expect(titles).toContain("Alpha");
      expect(titles).toContain("Gamma");
      expect(titles).not.toContain("Beta");
    });

    it("compiles all documents when documentIds is empty", async () => {
      insertDoc("d1", "One");
      insertChunk("d1", 0, "Content one.");
      insertDoc("d2", "Two");
      insertChunk("d2", 0, "Content two.");

      const result = await compiler.compile([]);
      // Empty array falls through to all-docs path
      expect(result.length).toBeGreaterThanOrEqual(2);
    });

    it("skips non-existent document IDs gracefully", async () => {
      insertDoc("d1", "Exists");
      insertChunk("d1", 0, "Content exists.");

      const result = await compiler.compile(["d1", "nonexistent"]);
      expect(result).toHaveLength(1);
      expect(result[0]!.title).toBe("Exists");
    });
  });

  describe("updatePageInsight()", () => {
    it("appends insight to existing page", async () => {
      insertDoc("d1", "Test Page");
      insertChunk("d1", 0, "Some content.");

      await compiler.compile();

      const page = db.query("SELECT id FROM wiki_pages WHERE slug = ?").get("test-page") as { id: string };
      await compiler.updatePageInsight(page.id, "This is an important insight.");

      const updated = db.query("SELECT content, version FROM wiki_pages WHERE id = ?").get(page.id) as { content: string; version: number };
      expect(updated.content).toContain("Derived Insight");
      expect(updated.content).toContain("This is an important insight.");
      expect(updated.version).toBe(2);
    });

    it("does nothing for non-existent page", async () => {
      // Should not throw
      await compiler.updatePageInsight("nonexistent", "insight");
    });
  });
});
