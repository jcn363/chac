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
    const stats = this.db.query(`
      SELECT 
        COUNT(*) as totalSearches,
        COUNT(DISTINCT query) as uniqueQueries,
        COALESCE(AVG(results_count), 0) as avgResults,
        SUM(CASE WHEN expanded_query IS NOT NULL THEN 1 ELSE 0 END) as expandedCount,
        SUM(CASE WHEN reranked = 1 THEN 1 ELSE 0 END) as rerankedCount
      FROM search_history
    `).get() as { totalSearches: number; uniqueQueries: number; avgResults: number; expandedCount: number; rerankedCount: number };

    const topQueries = this.db.query(`
      SELECT query, COUNT(*) as count 
      FROM search_history 
      GROUP BY query 
      ORDER BY count DESC 
      LIMIT 10
    `).all() as Array<{ query: string; count: number }>;

    return {
      totalSearches: stats.totalSearches,
      uniqueQueries: stats.uniqueQueries,
      avgResults: Math.round((stats.avgResults || 0) * 100) / 100,
      expandedCount: stats.expandedCount || 0,
      rerankedCount: stats.rerankedCount || 0,
      topQueries: topQueries.map(q => ({ query: q.query, count: q.count })),
    };
  }

  clearSearchHistory(): void {
    this.db.query("DELETE FROM search_history").run();
  }
}
