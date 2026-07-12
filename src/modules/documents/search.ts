import type { Database } from "bun:sqlite";
import type { LlmService } from "../llm/types";
import type { SettingsServiceType } from "../settings/types";
import { VectorIndex } from "../../utils/vector-index";
import { createEmbedding, collectLlmResponse, extractJsonFromLlm } from "../../utils/llm-helpers";
import { formatCitation } from "../../utils/citations";
import { MemoryCache } from "../../utils/cache";
import type { CacheStats } from "../../utils/cache";
import type { SearchResult, ExpandedQuery } from "./types";

const searchCache = new MemoryCache<SearchResult[]>(2 * 60 * 1000);

export class DocumentSearchService {
  constructor(
    private db: Database,
    private llm: LlmService,
    private chunkIndex: VectorIndex,
    private settings: SettingsServiceType
  ) {}

  async search(query: string, options: { limit?: number; rerank?: boolean; expand?: boolean } = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 5;
    const rerank = options.rerank ?? false;
    const expand = options.expand ?? false;

    // Check cache (skip caching for rerank/expand since they produce variable results)
    if (!rerank && !expand) {
      const cacheKey = `search:${query}:${limit}`;
      const cached = searchCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let searchQuery = query;
    let expandedData: ExpandedQuery | null = null;

    if (expand) {
      expandedData = await this.expandQuery(query);
      searchQuery = expandedData.expanded;
    }

    const queryVec = await createEmbedding(this.llm, searchQuery);

    // Get document mapping for titles
    const docMap = new Map<string, { documentId: string; documentTitle: string }>();
    const docRows = this.db.query(
      "SELECT c.id, c.document_id, d.title FROM chunks c JOIN documents d ON c.document_id = d.id"
    ).all() as Array<{ id: string; document_id: string; title: string }>;
    for (const row of docRows) {
      docMap.set(row.id, { documentId: row.document_id, documentTitle: row.title });
    }

    const results = this.chunkIndex.search(this.db, "chunks", "id", "content", queryVec, { limit: limit * 3 });

    let mapped: SearchResult[] = results.map((r) => {
      const docInfo = docMap.get(r.id);
      return {
        chunkId: r.id,
        content: r.content,
        documentId: docInfo?.documentId ?? "",
        documentTitle: docInfo?.documentTitle ?? undefined,
        score: r.score,
        citation: docInfo?.documentTitle ? formatCitation(docInfo.documentTitle, r.content) : "",
      };
    });

    if (rerank) {
      mapped = await this.rerankResults(query, mapped);
    }

    const final = mapped.slice(0, limit);

    // Cache plain search results (no rerank/expand)
    if (!rerank && !expand) {
      searchCache.set(`search:${query}:${limit}`, final);
    }

    return final;
  }

  async expandQuery(query: string): Promise<ExpandedQuery> {
    const messages = [
      {
        role: "system",
        content: `You are a query expansion assistant. Given a user query, generate:
1. An expanded version with synonyms and related terms
2. A list of 3-5 relevant keywords

Return JSON: {"expanded": "...", "keywords": ["...", "..."]}`
      },
      { role: "user", content: query },
    ];

    const response = await collectLlmResponse(this.llm, messages);

    const parsed = extractJsonFromLlm<{ expanded?: string; keywords?: string[] }>(response, /\{[\s\S]*\}/);
    if (parsed) {
      return {
        original: query,
        expanded: parsed.expanded ?? query,
        keywords: parsed.keywords ?? [],
      };
    }

    return { original: query, expanded: query, keywords: [] };
  }

  async rerankResults(query: string, results: SearchResult[]): Promise<SearchResult[]> {
    if (results.length <= 1) return results;

    const chunksSummary = results.map((r, i) => `[${i}] ${r.content.slice(0, 200)}`).join("\n\n");

    const messages = [
      {
        role: "system",
        content: `You are a search result reranker. Given a query and search results, return the indices of results sorted by relevance (most relevant first).

Query: ${query}

Results:
${chunksSummary}

Return ONLY a JSON array of indices, e.g. [2, 0, 1]`
      },
      { role: "user", content: "Rerank these results by relevance." },
    ];

    const response = await collectLlmResponse(this.llm, messages);

    const indices = extractJsonFromLlm<number[]>(response, /\[[\d,\s]+\]/);
    if (indices) {
      return indices
        .filter((i) => i >= 0 && i < results.length)
        .map((i, rank) => ({
          ...results[i]!,
          score: results[i]!.score * (1 - rank * 0.1),
        }));
    }

    return results;
  }

  getCacheStats(): { search: CacheStats } {
    return { search: searchCache.stats() };
  }

  clearCache(): void {
    searchCache.clear();
  }

  invalidateSearchCache(): void {
    searchCache.clear();
  }
}
