import type { Database } from "bun:sqlite";
import type { ChatCompletionLLM } from "../../types/llm";
import type { LlmService } from "../llm/types";
import type { SettingsServiceType } from "../settings/types";
import type { DocumentSearchService } from "../documents/search";
import { VectorIndex } from "../../utils/vector-index";
import { createEmbedding, estimateTokens } from "../../utils/llm-helpers";
import { generateCitation } from "../../utils/citations";
import { createLogger } from "../../utils/logger";

const log = createLogger("chat:rag");

const RRF_K = 60;

export interface RagOptions {
  maxChunks?: number;
  wikiThreshold?: number;
  expand?: boolean;
  rerank?: boolean;
}

export interface RagResult {
  chunkId: string;
  content: string;
  score: number;
  source: "wiki" | "chunk";
  citation?: string;
  documentTitle?: string;
}

export interface BuildContextResult {
  contextChunks: RagResult[];
  contextBlock: string;
  citationFooter: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

/** RAG retrieval: query expansion, parallel vector search, RRF fusion, citations. */
export class RagRetriever {
  constructor(
    private db: Database,
    private llm: ChatCompletionLLM,
    private searchService: DocumentSearchService,
    private wikiIndex: VectorIndex,
    private chunkIndex: VectorIndex,
    private settings: SettingsServiceType
  ) {}

  private async embedQuery(query: string): Promise<Float32Array> {
    const llmService = this.llm as unknown as LlmService;
    return createEmbedding(llmService, query);
  }

  /** Reciprocal Rank Fusion retrieval across wiki pages and document chunks. */
  async retrieve(query: string, options?: RagOptions): Promise<RagResult[]> {
    const wikiThreshold =
      options?.wikiThreshold ?? (this.settings.get("rag.wiki_threshold") as number);
    const maxChunks =
      options?.maxChunks ?? (this.settings.get("rag.max_chunks") as number);
    const shouldExpand =
      options?.expand ?? (this.settings.get("rag.expand") as boolean);
    const shouldRerank =
      options?.rerank ?? (this.settings.get("rag.rerank") as boolean);

    // Optional query expansion
    let searchQuery = query;
    if (shouldExpand) {
      try {
        const expanded = await this.searchService.expandQuery(query);
        searchQuery = expanded.expanded;
      } catch {
        log.warn("Query expansion failed, using original query");
      }
    }

    const queryVec = await this.embedQuery(searchQuery);

    const [wikiRaw, chunkRaw] = await Promise.all([
      this.wikiIndex.search(this.db, "wiki_pages", "id", "content", queryVec, {
        threshold: wikiThreshold,
      }),
      this.chunkIndex.search(this.db, "chunks", "id", "content", queryVec, {
        limit: maxChunks * 3,
      }),
    ]);

    // Deduplicate: skip chunks whose content matches an already-seen wiki entry
    const seenContent = new Map<string, true>();
    for (const r of wikiRaw) {
      seenContent.set(r.content.trim().toLowerCase(), true);
    }
    const dedupedChunks = chunkRaw.filter(
      (r) => !seenContent.has(r.content.trim().toLowerCase())
    );

    // Reciprocal Rank Fusion
    const scores = new Map<
      string,
      { chunkId: string; content: string; score: number; source: string }
    >();

    for (let rank = 0; rank < wikiRaw.length; rank++) {
      const r = wikiRaw[rank]!;
      const rrfScore = 1 / (RRF_K + rank + 1);
      scores.set(`wiki:${r.id}`, {
        chunkId: r.id,
        content: r.content,
        score: rrfScore,
        source: "wiki",
      });
    }

    for (let rank = 0; rank < dedupedChunks.length; rank++) {
      const r = dedupedChunks[rank]!;
      const rrfScore = 1 / (RRF_K + rank + 1);
      const key = `chunk:${r.id}`;
      const existing = scores.get(key);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(key, {
          chunkId: r.id,
          content: r.content,
          score: rrfScore,
          source: "chunk",
        });
      }
    }

    const fused = Array.from(scores.values());
    fused.sort((a, b) => b.score - a.score);
    let results = fused.slice(0, maxChunks * 3);

    // Optional LLM reranking
    if (shouldRerank && results.length > 1) {
      try {
        const searchResults = results.map((r) => ({
          chunkId: r.chunkId,
          content: r.content,
          score: r.score,
          documentId: "",
          citation: "",
        }));
        const reranked = await this.searchService.rerankResults(query, searchResults);
        results = reranked.map((r) => ({
          chunkId: r.chunkId,
          content: r.content,
          score: r.score,
          source: "",
        }));
      } catch {
        log.warn("Reranking failed, using original order");
      }
    }

    // Generate citations and trim to maxChunks
    return results.slice(0, maxChunks).map((r) => {
      const citation = generateCitation(this.db, r.chunkId, r.content);
      return {
        chunkId: r.chunkId,
        content: r.content,
        score: r.score,
        source: (r.source || "chunk") as "wiki" | "chunk",
        citation: citation.citation,
        documentTitle: citation.documentTitle,
      };
    });
  }

  /** Fill a token budget with the most recent messages that fit. */
  buildHistoryBudget(
    sessionId: string,
    ctxSize: number,
    currentMessages: Array<{ role: string; content: string }>
  ): Array<{ role: "user" | "assistant"; content: string }> {
    const responseBuffer = Math.floor(ctxSize * 0.3);
    const usedTokens = currentMessages.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0
    );
    const historyBudget = Math.max(0, ctxSize - responseBuffer - usedTokens - 50);

    const allHistory = this.db
      .query(
        "SELECT * FROM chat_messages WHERE session_id = ? AND (role = 'user' OR role = 'assistant') ORDER BY created_at DESC"
      )
      .all(sessionId) as Array<{
      role: string;
      content: string;
    }>;

    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    let tokensUsed = 0;

    for (let i = allHistory.length - 1; i >= 0; i--) {
      const msg = allHistory[i]!;
      if (msg.role !== "user" && msg.role !== "assistant") continue;
      const msgTokens = estimateTokens(msg.content);
      if (tokensUsed + msgTokens > historyBudget) break;
      history.unshift({ role: msg.role as "user" | "assistant", content: msg.content });
      tokensUsed += msgTokens;
    }

    return history;
  }

  /** Build complete context: RAG chunks + history budget for LLM consumption. */
  async buildContext(
    query: string,
    sessionId: string,
    memoryContext: string,
    systemPrompt: string | null
  ): Promise<BuildContextResult> {
    const contextChunks = await this.retrieve(query);

    const contextBlock =
      contextChunks.length > 0
        ? contextChunks
            .map((c, i) => `[${i + 1}] ${c.content}`)
            .join("\n\n")
        : "";

    const citations = contextChunks
      .filter((c) => c.citation)
      .map((c, i) => `[${i + 1}] ${c.citation}`)
      .join("\n");
    const citationFooter = citations ? `\n\nSources:\n${citations}` : "";

    // Build current messages array for token estimation
    const currentMessages: Array<{ role: string; content: string }> = [];
    if (memoryContext) {
      currentMessages.push({
        role: "system",
        content: `User context from previous sessions:\n${memoryContext}`,
      });
    }
    if (systemPrompt) {
      currentMessages.push({ role: "system", content: systemPrompt });
    }
    if (contextChunks.length > 0) {
      currentMessages.push({
        role: "system",
        content: `Context from documents:\n${contextBlock}${citationFooter}\n\nAnswer based on this context when relevant. Cite sources using [1], [2] etc.`,
      });
    }

    const ctxSize = this.settings.get("llm.chat.ctx_size") as number;
    const history = this.buildHistoryBudget(sessionId, ctxSize, currentMessages);

    return { contextChunks, contextBlock, citationFooter, history };
  }
}
