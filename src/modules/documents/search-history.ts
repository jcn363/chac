import type { Database } from "bun:sqlite";

export class SearchHistoryService {
  constructor(private db: Database) {}

  logSearch(query: string, resultsCount: number, expandedQuery?: string, reranked?: boolean): void {
    this.db
      .query(
        "INSERT INTO search_history (query, results_count, expanded_query, reranked) VALUES (?, ?, ?, ?)"
      )
      .run(query, resultsCount, expandedQuery ?? null, reranked ? 1 : 0);
  }

  getSearchHistory(options: { limit?: number } = {}): Array<{ id: number; query: string; results_count: number; expanded_query: string | null; reranked: number; created_at: string }> {
    const limit = options.limit ?? 50;
    return this.db
      .query("SELECT * FROM search_history ORDER BY created_at DESC LIMIT ?")
      .all(limit) as Array<{ id: number; query: string; results_count: number; expanded_query: string | null; reranked: number; created_at: string }>;
  }

  getSearchAnalytics(): {
    totalSearches: number;
    uniqueQueries: number;
    avgResults: number;
    expandedCount: number;
    rerankedCount: number;
    topQueries: Array<{ query: string; count: number }>;
  } {
    const all = this.db.query("SELECT * FROM search_history").all() as Array<{
      query: string;
      results_count: number;
      expanded_query: string | null;
      reranked: number;
    }>;
    const queryCounts = new Map<string, number>();
    for (const row of all) {
      queryCounts.set(row.query, (queryCounts.get(row.query) ?? 0) + 1);
    }
    const topQueries = [...queryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));
    return {
      totalSearches: all.length,
      uniqueQueries: queryCounts.size,
      avgResults: all.length > 0 ? all.reduce((sum, r) => sum + r.results_count, 0) / all.length : 0,
      expandedCount: all.filter((r) => r.expanded_query).length,
      rerankedCount: all.filter((r) => r.reranked).length,
      topQueries,
    };
  }

  clearSearchHistory(): void {
    this.db.query("DELETE FROM search_history").run();
  }
}
