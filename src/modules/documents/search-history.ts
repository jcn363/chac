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

  clearSearchHistory(): void {
    this.db.query("DELETE FROM search_history").run();
  }
}
