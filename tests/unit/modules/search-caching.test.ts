import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { DocumentsService } from "../../../src/modules/documents/service";
import { DocumentSearchService } from "../../../src/modules/documents/search";
import { embeddingCache } from "../../../src/utils/cache";
import type { Kernel } from "../../../src/kernel/types";
import type { Database } from "bun:sqlite";

function setupTestDb(kernel: Kernel): Database {
  const db = kernel.get<Database>("db");
  db.query(
    "INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)"
  ).run("doc1", "Test Document", "hash1", 2);

  db.query(
    "INSERT INTO chunks (id, document_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?)"
  ).run("chunk1", "doc1", 0, "The quick brown fox jumps over the lazy dog", null);
  db.query(
    "INSERT INTO chunks (id, document_id, chunk_index, content, embedding) VALUES (?, ?, ?, ?, ?)"
  ).run("chunk2", "doc1", 1, "Another chunk of text about something else entirely", null);

  return db;
}

describe("Search caching", () => {
  let kernel: Kernel;
  let docs: DocumentsService;
  let search: DocumentSearchService;

  beforeEach(() => {
    kernel = createTestKernel();
    docs = kernel.get<DocumentsService>("docs");
    search = kernel.get<DocumentSearchService>("search");
    setupTestDb(kernel);
    embeddingCache.clear();
    embeddingCache.resetStats();
  });

  afterEach(() => {
    docs.clearCache();
    search.clearCache();
  });

  it("returns search results", async () => {
    const results = await search.search("fox", { limit: 5 });
    expect(Array.isArray(results)).toBe(true);
  });

  it("second call returns cached results (search cache hit)", async () => {
    await search.search("fox", { limit: 5 });
    const statsAfterFirst = search.getCacheStats();

    await search.search("fox", { limit: 5 });
    const statsAfterSecond = search.getCacheStats();

    expect(statsAfterSecond.search.hits).toBeGreaterThan(statsAfterFirst.search.hits);
  });

  it("different limits produce separate cache entries", async () => {
    await search.search("fox", { limit: 3 });
    await search.search("fox", { limit: 5 });

    const stats = search.getCacheStats();
    expect(stats.search.totalSet).toBeGreaterThanOrEqual(2);
  });

  it("does not cache when rerank is true", async () => {
    const before = search.getCacheStats().search.totalSet;
    await search.search("fox", { limit: 5, rerank: true });
    const after = search.getCacheStats().search.totalSet;
    expect(after).toBe(before);
  });

  it("does not cache when expand is true", async () => {
    const before = search.getCacheStats().search.totalSet;
    await search.search("fox", { limit: 5, expand: true });
    const after = search.getCacheStats().search.totalSet;
    expect(after).toBe(before);
  });

  it("invalidateSearchCache clears search cache", async () => {
    await search.search("fox", { limit: 5 });
    expect(search.getCacheStats().search.size).toBeGreaterThan(0);

    search.invalidateSearchCache();
    expect(search.getCacheStats().search.size).toBe(0);
  });

  it("clearCache clears search cache", async () => {
    await search.search("fox", { limit: 5 });
    expect(search.getCacheStats().search.size).toBeGreaterThan(0);

    search.clearCache();
    expect(search.getCacheStats().search.size).toBe(0);
  });

  it("getCacheStats returns valid structure", () => {
    const stats = search.getCacheStats();
    expect(stats).toHaveProperty("search");
    expect(typeof stats.search.hits).toBe("number");
    expect(typeof stats.search.hitRate).toBe("number");
  });
});
