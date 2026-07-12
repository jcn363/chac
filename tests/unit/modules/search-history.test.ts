import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { SearchHistoryService } from "../../../src/modules/documents/search-history";
import type { Kernel } from "../../../src/kernel/types";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Search History", () => {
  let kernel: Kernel;
  let searchHistory: SearchHistoryService;
  let testDir: string;

  beforeEach(() => {
    kernel = createTestKernel();
    searchHistory = kernel.get<SearchHistoryService>("searchHistory");
    testDir = join(import.meta.dir, "../../.test-search-history");
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

  describe("logSearch", () => {
    it("logs a search query", () => {
      searchHistory.logSearch("machine learning", 5);
      const history = searchHistory.getSearchHistory();
      expect(history.length).toBe(1);
      expect(history[0]!.query).toBe("machine learning");
      expect(history[0]!.results_count).toBe(5);
    });

    it("logs search with expanded query", () => {
      searchHistory.logSearch("ML", 3, "machine learning artificial intelligence");
      const history = searchHistory.getSearchHistory();
      expect(history[0]!.expanded_query).toBe("machine learning artificial intelligence");
    });

    it("logs reranked search", () => {
      searchHistory.logSearch("test", 2, undefined, true);
      const history = searchHistory.getSearchHistory();
      expect(history[0]!.reranked).toBe(1);
    });
  });

  describe("getSearchHistory", () => {
    it("returns empty history", () => {
      const history = searchHistory.getSearchHistory();
      expect(history.length).toBe(0);
    });

    it("returns all logged queries", async () => {
      searchHistory.logSearch("first", 1);
      searchHistory.logSearch("second", 2);
      searchHistory.logSearch("third", 3);

      const history = searchHistory.getSearchHistory();
      expect(history.length).toBe(3);
      const queries = history.map((h) => h.query);
      expect(queries).toContain("first");
      expect(queries).toContain("second");
      expect(queries).toContain("third");
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        searchHistory.logSearch(`query ${i}`, i);
      }

      const history = searchHistory.getSearchHistory({ limit: 3 });
      expect(history.length).toBe(3);
    });
  });

  describe("clearSearchHistory", () => {
    it("clears all history", () => {
      searchHistory.logSearch("test1", 1);
      searchHistory.logSearch("test2", 2);

      searchHistory.clearSearchHistory();
      const history = searchHistory.getSearchHistory();
      expect(history.length).toBe(0);
    });
  });
});
