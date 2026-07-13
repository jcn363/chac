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

  describe("getSearchAnalytics", () => {
    it("returns zeroed analytics with no data", () => {
      const analytics = searchHistory.getSearchAnalytics();
      expect(analytics.totalSearches).toBe(0);
      expect(analytics.uniqueQueries).toBe(0);
      expect(analytics.avgResults).toBe(0);
      expect(analytics.expandedCount).toBe(0);
      expect(analytics.rerankedCount).toBe(0);
      expect(analytics.topQueries.length).toBe(0);
    });

    it("computes analytics from search entries", () => {
      searchHistory.logSearch("ml", 5, "machine learning", true);
      searchHistory.logSearch("ml", 3, "machine learning deep", true);
      searchHistory.logSearch("rust", 8, undefined, false);

      const analytics = searchHistory.getSearchAnalytics();
      expect(analytics.totalSearches).toBe(3);
      expect(analytics.uniqueQueries).toBe(2);
      expect(analytics.avgResults).toBeCloseTo(5.33, 1);
      expect(analytics.expandedCount).toBe(2);
      expect(analytics.rerankedCount).toBe(2);
    });

    it("orders topQueries by count descending", () => {
      searchHistory.logSearch("common", 1);
      searchHistory.logSearch("common", 2);
      searchHistory.logSearch("common", 3);
      searchHistory.logSearch("rare", 1);

      const analytics = searchHistory.getSearchAnalytics();
      expect(analytics.topQueries.length).toBe(2);
      expect(analytics.topQueries[0]!.query).toBe("common");
      expect(analytics.topQueries[0]!.count).toBe(3);
      expect(analytics.topQueries[1]!.query).toBe("rare");
      expect(analytics.topQueries[1]!.count).toBe(1);
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
