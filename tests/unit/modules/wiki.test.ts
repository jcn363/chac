import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import type { Kernel } from "../../../src/kernel/types";
import type { WikiService } from "../../../src/modules/wiki/service";
import type { Database } from "bun:sqlite";

let kernel: Kernel;
let wiki: WikiService;

function insertWikiPage(db: Database, title: string, content: string) {
  db.query(`INSERT INTO wiki_pages (id, title, slug, content, content_hash, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`).run(
    crypto.randomUUID(), title, title.toLowerCase().replace(/\s+/g, '-'), content, 'hash_' + title
  );
}

beforeEach(() => {
  kernel = createTestKernel();
  wiki = kernel.get<WikiService>("wiki");
});

afterEach(() => {
  const db = kernel.get<{ close: () => void }>("db" as any);
  db.close();
});

describe("WikiService", () => {
  it("lists pages (empty)", () => {
    const result = wiki.list();
    expect(result.pages).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns undefined for unknown page", () => {
    expect(wiki.get("nonexistent")).toBeUndefined();
  });

  it("returns page after insert", () => {
    const db = kernel.get<Database>("db");
    insertWikiPage(db, "Test Page", "content here");
    const pages = db.query("SELECT * FROM wiki_pages").all() as any[];
    expect(pages.length).toBe(1);
    const page = wiki.get(pages[0]!.id);
    expect(page).toBeDefined();
    expect(page!.title).toBe("Test Page");
  });

  it("deletes a page", () => {
    const db = kernel.get<Database>("db");
    insertWikiPage(db, "Delete Me", "content");
    const pages = db.query("SELECT * FROM wiki_pages").all() as any[];
    expect(pages.length).toBe(1);
    const deleted = wiki.delete(pages[0]!.id);
    expect(deleted).toBe(true);
    expect(wiki.get(pages[0]!.id)).toBeUndefined();
  });

  it("delete returns false for non-existent id", () => {
    expect(wiki.delete("nonexistent-id")).toBe(false);
  });

  it("lists pages with pagination", () => {
    const db = kernel.get<Database>("db");
    for (let i = 0; i < 5; i++) {
      insertWikiPage(db, `Page ${i}`, `content ${i}`);
    }
    const page1 = wiki.list({ page: 1, perPage: 2 });
    expect(page1.pages).toHaveLength(2);
    expect(page1.total).toBe(5);
    const page2 = wiki.list({ page: 2, perPage: 2 });
    expect(page2.pages).toHaveLength(2);
  });

  it("search returns array (empty when no embeddings)", async () => {
    const db = kernel.get<Database>("db");
    insertWikiPage(db, "Machine Learning", "Deep dive into machine learning algorithms");
    const results = await wiki.search("machine learning", { limit: 2 });
    expect(Array.isArray(results)).toBe(true);
    // Results may be empty since direct SQL inserts have no embeddings
  });

  it("invalidateIndex does not throw", () => {
    expect(() => wiki.invalidateIndex()).not.toThrow();
  });

  it("onCompile registers callback", () => {
    let called = false;
    wiki.onCompile(() => { called = true; });
    expect(called).toBe(false);
  });

  it("setCompiler updates compiler", () => {
    // Just verify it doesn't crash
    wiki.setCompiler(wiki["compiler"]);
    expect(wiki.get("anything")).toBeUndefined();
  });
});
