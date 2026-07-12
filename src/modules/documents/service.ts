import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { generateId } from "../../utils/id";
import { contentHash } from "../../utils/hash";
import { chunkText, chunkTextSemantic } from "../../utils/chunking";
import { embeddingToBlob } from "../../utils/vector";
import { VectorIndex } from "../../utils/vector-index";
import { parseDocument, detectFormat } from "../../utils/document-parser";
import type { Document, SearchResult, IngestResult, BatchIngestResult, BatchDeleteResult, DocumentStatus, ExpandedQuery, TagInfo, DocumentWithTags } from "./types";
import { basename, resolve } from "node:path";
import { getAppRoot } from "../../platform/paths";
import { embeddingCache } from "../../utils/cache";
import { MemoryCache } from "../../utils/cache";
import type { CacheStats } from "../../utils/cache";

const searchCache = new MemoryCache<SearchResult[]>(2 * 60 * 1000);

export class DocumentsService {
  private db: Database;
  private kernel: Kernel;
  private chunkIndex = new VectorIndex();

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.db = kernel.get<Database>("db");
  }

  async ingest(filePath: string): Promise<IngestResult> {
    // Security: validate path doesn't contain traversal or absolute paths
    const normalized = filePath.replace(/\\/g, "/");
    if (normalized.includes("..")) {
      throw new Error("Path traversal not allowed");
    }

    const resolved = resolve(filePath);
    const appRoot = getAppRoot();
    const allowedBase = resolve(appRoot);
    if (!resolved.startsWith(allowedBase + "/") && resolved !== allowedBase) {
      throw new Error("Access denied: path outside allowed directory");
    }

    const file = Bun.file(filePath);
    if (!await file.exists()) {
      throw new Error(`File not found: ${filePath}`);
    }

    const buffer = await file.arrayBuffer();
    const format = detectFormat(filePath);
    const parseResult = await parseDocument(filePath, buffer);
    const content = parseResult.content;

    const hash = await contentHash(content);
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");

    // Dedup check
    const existing = this.db
      .query("SELECT id FROM documents WHERE content_hash = ?")
      .get(hash) as { id: string } | undefined;
    if (existing) {
      const doc = this.db.query("SELECT * FROM documents WHERE id = ?").get(existing.id) as Document;
      return { id: doc.id, title: doc.title, chunkCount: doc.chunk_count };
    }

    const docId = generateId();
    const title = basename(filePath) || "Untitled";
    const chunkSize = settings.get("rag.chunk_size") as number;
    const chunkOverlap = settings.get("rag.chunk_overlap") as number;
    const chunkMode = settings.get("rag.chunk_mode") as string;
    const chunks = chunkMode === "semantic"
      ? chunkTextSemantic(content, chunkSize)
      : chunkText(content, chunkSize, chunkOverlap);

    // Insert document
    this.db
      .query(
        "INSERT INTO documents (id, title, source_path, content_hash, mime_type, file_size, chunk_count) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(docId, title, filePath, hash, file.type, file.size, chunks.length);

    // Insert chunks + embeddings (batched with concurrency limit)
    const llm = this.kernel.get<{ embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> } }>("llm");

    const insertChunk = this.db.query(
      "INSERT INTO chunks (id, document_id, chunk_index, content, token_count, embedding, embedding_model, embedding_dimensions) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    const BATCH_SIZE = 8;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await Promise.all(
        batch.map((chunk) => llm.embeddings.create({ input: chunk.content }))
      );
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
        const firstEmb = embeddings[j]!.data[0];
        if (!firstEmb) throw new Error("No embedding returned");
        const embedding = firstEmb.embedding;
        const blob = embeddingToBlob(embedding);
        insertChunk.run(
          generateId(),
          docId,
          chunk.index,
          chunk.content,
          chunk.tokenCount,
          blob,
          "local",
          embedding.length
        );
      }
    }

    return { id: docId, title, chunkCount: chunks.length };
  }

  invalidateIndex(): void {
    this.chunkIndex.invalidate();
    searchCache.clear();
  }

  getCacheStats(): { embedding: CacheStats; search: CacheStats } {
    return {
      embedding: embeddingCache.stats(),
      search: searchCache.stats(),
    };
  }

  clearCache(): void {
    searchCache.clear();
    embeddingCache.clear();
  }

  list(options: { page?: number; perPage?: number; sort?: string } = {}): {
    documents: Document[];
    total: number;
    page: number;
    perPage: number;
  } {
    const page = options.page ?? 1;
    const perPage = options.perPage ?? 20;
    const offset = (page - 1) * perPage;

    const total = (this.db.query("SELECT COUNT(*) as count FROM documents").get() as { count: number }).count;
    const documents = this.db
      .query(`SELECT * FROM documents ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(perPage, offset) as Document[];

    return { documents, total, page, perPage };
  }

  get(id: string): Document | undefined {
    const row = this.db.query("SELECT * FROM documents WHERE id = ?").get(id);
    return row ? (row as Document) : undefined;
  }

  delete(id: string): boolean {
    const result = this.db.query("DELETE FROM documents WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async batchIngest(filePaths: string[]): Promise<BatchIngestResult> {
    const results: IngestResult[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    for (const filePath of filePaths) {
      try {
        const result = await this.ingest(filePath);
        results.push(result);
      } catch (err) {
        errors.push({
          path: filePath,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return {
      results,
      errors,
      total: filePaths.length,
      succeeded: results.length,
      failed: errors.length,
    };
  }

  batchDelete(ids: string[]): BatchDeleteResult {
    let deleted = 0;
    const notFound: string[] = [];

    for (const id of ids) {
      const result = this.db.query("DELETE FROM documents WHERE id = ?").run(id);
      if (result.changes > 0) {
        deleted++;
      } else {
        notFound.push(id);
      }
    }

    return { deleted, notFound };
  }

  async reingest(id: string): Promise<IngestResult> {
    const doc = this.db.query("SELECT * FROM documents WHERE id = ?").get(id) as Document | undefined;
    if (!doc) {
      throw new Error(`Document not found: ${id}`);
    }
    if (!doc.source_path) {
      throw new Error(`Document has no source path: ${id}`);
    }

    // Delete old chunks
    this.db.query("DELETE FROM chunks WHERE document_id = ?").run(id);
    this.invalidateIndex();

    // Re-parse file
    const file = Bun.file(doc.source_path);
    if (!await file.exists()) {
      throw new Error(`Source file not found: ${doc.source_path}`);
    }

    const buffer = await file.arrayBuffer();
    const parseResult = await parseDocument(doc.source_path, buffer);
    const content = parseResult.content;
    const hash = await contentHash(content);

    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    const chunkSize = settings.get("rag.chunk_size") as number;
    const chunkOverlap = settings.get("rag.chunk_overlap") as number;
    const chunkMode = settings.get("rag.chunk_mode") as string;
    const chunks = chunkMode === "semantic"
      ? chunkTextSemantic(content, chunkSize)
      : chunkText(content, chunkSize, chunkOverlap);

    // Update document
    this.db
      .query("UPDATE documents SET content_hash = ?, chunk_count = ?, file_size = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hash, chunks.length, file.size, id);

    // Insert new chunks
    const llm = this.kernel.get<{ embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> } }>("llm");
    const insertChunk = this.db.query(
      "INSERT INTO chunks (id, document_id, chunk_index, content, token_count, embedding, embedding_model, embedding_dimensions) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    const BATCH_SIZE = 8;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await Promise.all(
        batch.map((chunk) => llm.embeddings.create({ input: chunk.content }))
      );
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j]!;
        const firstEmb = embeddings[j]!.data[0];
        if (!firstEmb) throw new Error("No embedding returned");
        const embedding = firstEmb.embedding;
        const blob = embeddingToBlob(embedding);
        insertChunk.run(
          generateId(),
          id,
          chunk.index,
          chunk.content,
          chunk.tokenCount,
          blob,
          "local",
          embedding.length
        );
      }
    }

    return { id: doc.id, title: doc.title, chunkCount: chunks.length };
  }

  getStatus(): DocumentStatus {
    const total = (this.db.query("SELECT COUNT(*) as count FROM documents").get() as { count: number }).count;
    const totalChunks = (this.db.query("SELECT COUNT(*) as count FROM chunks").get() as { count: number }).count;
    const lastDoc = this.db.query("SELECT MAX(updated_at) as last FROM documents").get() as { last: string | null };
    return {
      total,
      totalChunks,
      lastIngestedAt: lastDoc?.last ?? null,
    };
  }

  // --- Tag Management ---

  addTags(documentId: string, tags: string[]): void {
    const doc = this.db.query("SELECT id FROM documents WHERE id = ?").get(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    const insert = this.db.query(
      "INSERT OR IGNORE INTO document_tags (document_id, tag) VALUES (?, ?)"
    );
    const normalized = tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
    for (const tag of normalized) {
      insert.run(documentId, tag);
    }
  }

  removeTags(documentId: string, tags: string[]): void {
    const remove = this.db.query(
      "DELETE FROM document_tags WHERE document_id = ? AND tag = ?"
    );
    for (const tag of tags) {
      remove.run(documentId, tag.trim().toLowerCase());
    }
  }

  getDocumentTags(documentId: string): string[] {
    const rows = this.db
      .query("SELECT tag FROM document_tags WHERE document_id = ? ORDER BY tag")
      .all(documentId) as Array<{ tag: string }>;
    return rows.map((r) => r.tag);
  }

  setDocumentTags(documentId: string, tags: string[]): void {
    const doc = this.db.query("SELECT id FROM documents WHERE id = ?").get(documentId);
    if (!doc) throw new Error(`Document not found: ${documentId}`);

    this.db.query("DELETE FROM document_tags WHERE document_id = ?").run(documentId);
    this.addTags(documentId, tags);
  }

  listTags(): TagInfo[] {
    return this.db
      .query(
        "SELECT tag, COUNT(DISTINCT document_id) as documentCount FROM document_tags GROUP BY tag ORDER BY documentCount DESC, tag"
      )
      .all() as TagInfo[];
  }

  getDocumentsByTag(tag: string, options: { page?: number; perPage?: number } = {}): {
    documents: Document[];
    total: number;
    page: number;
    perPage: number;
  } {
    const page = options.page ?? 1;
    const perPage = options.perPage ?? 20;
    const offset = (page - 1) * perPage;
    const normalizedTag = tag.trim().toLowerCase();

    const total = (this.db
      .query("SELECT COUNT(*) as count FROM document_tags WHERE tag = ?")
      .get(normalizedTag) as { count: number }).count;

    const documents = this.db
      .query(
        "SELECT d.* FROM documents d JOIN document_tags dt ON d.id = dt.document_id WHERE dt.tag = ? ORDER BY d.created_at DESC LIMIT ? OFFSET ?"
      )
      .all(normalizedTag, perPage, offset) as Document[];

    return { documents, total, page, perPage };
  }

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

    const llm = this.kernel.get<{ embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> } }>("llm");

    let searchQuery = query;
    let expandedData: ExpandedQuery | null = null;

    if (expand) {
      expandedData = await this.expandQuery(query);
      searchQuery = expandedData.expanded;
    }

    const embResult = await llm.embeddings.create({ input: searchQuery });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    const queryVec = new Float32Array(firstEmb.embedding);

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
        citation: this.generateCitation(docInfo?.documentTitle, r.content),
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

  private generateCitation(title: string | undefined, content: string): string {
    if (!title) return "";
    const preview = content.slice(0, 100).replace(/\n/g, " ").trim();
    return `Source: "${title}" — "${preview}..."`;
  }

  async expandQuery(query: string): Promise<ExpandedQuery> {
    const llm = this.kernel.get<{
      chat: { completions: (opts: { messages: Array<{ role: string; content: string }>; stream: boolean }) => AsyncGenerator<string> }
    }>("llm");

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

    let response = "";
    for await (const chunk of llm.chat.completions({ messages, stream: false })) {
      response += chunk;
    }

    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          original: query,
          expanded: parsed.expanded ?? query,
          keywords: parsed.keywords ?? [],
        };
      }
    } catch {
      // Parse error, return original
    }

    return { original: query, expanded: query, keywords: [] };
  }

  async rerankResults(query: string, results: SearchResult[]): Promise<SearchResult[]> {
    if (results.length <= 1) return results;

    const llm = this.kernel.get<{
      chat: { completions: (opts: { messages: Array<{ role: string; content: string }>; stream: boolean }) => AsyncGenerator<string> }
    }>("llm");

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

    let response = "";
    for await (const chunk of llm.chat.completions({ messages, stream: false })) {
      response += chunk;
    }

    try {
      const match = response.match(/\[[\d,\s]+\]/);
      if (match) {
        const indices = JSON.parse(match[0]) as number[];
        return indices
          .filter((i) => i >= 0 && i < results.length)
          .map((i, rank) => ({
            ...results[i]!,
            score: results[i]!.score * (1 - rank * 0.1),
          }));
      }
    } catch {
      // Parse error, return original order
    }

    return results;
  }

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

  async suggestQuestions(documentId?: string, count: number = 5): Promise<string[]> {
    const llm = this.kernel.get<{
      chat: { completions: (opts: { messages: Array<{ role: string; content: string }>; stream: boolean }) => AsyncGenerator<string> }
    }>("llm");

    let context = "";
    if (documentId) {
      const doc = this.db.query("SELECT * FROM documents WHERE id = ?").get(documentId) as { title: string } | undefined;
      if (!doc) return [];
      const chunks = this.db
        .query("SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index LIMIT 10")
        .all(documentId) as Array<{ content: string }>;
      context = `Document: ${doc.title}\n\nContent:\n${chunks.map((c) => c.content).join("\n\n")}`;
    } else {
      const docs = this.db
        .query("SELECT title FROM documents ORDER BY created_at DESC LIMIT 5")
        .all() as Array<{ title: string }>;
      context = `Available documents: ${docs.map((d) => d.title).join(", ")}`;
    }

    const messages = [
      {
        role: "system",
        content: `Generate ${count} relevant questions that someone might ask about this content. Return ONLY a JSON array of strings, no other text. Example: ["Question 1?", "Question 2?"]`
      },
      { role: "user", content: context },
    ];

    let response = "";
    for await (const chunk of llm.chat.completions({ messages, stream: false })) {
      response += chunk;
    }

    try {
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        const questions = JSON.parse(match[0]);
        if (Array.isArray(questions)) {
          return questions.filter((q: unknown) => typeof q === "string").slice(0, count);
        }
      }
    } catch {
      // Parse error
    }

    return [];
  }
}
