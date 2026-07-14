import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { NotFoundError } from "../../errors";
import { generateId } from "../../utils/id";
import { contentHash } from "../../utils/hash";
import { chunkText, chunkTextSemantic } from "../../utils/chunking";
import { VectorIndex } from "../../utils/vector-index";
import { parseDocument, detectFormat } from "../../utils/document-parser";
import { collectLlmResponse, extractJsonFromLlm, embedAndInsertChunks } from "../../utils/llm-helpers";
import { deleteById, countRows, parsePagination } from "../../utils/db-helpers";
import type { Document, IngestResult, BatchIngestResult, BatchDeleteResult, DocumentStatus } from "./types";
import { basename, resolve } from "node:path";
import { getAppRoot } from "../../platform/paths";
import { embeddingCache } from "../../utils/cache";
import type { CacheStats } from "../../utils/cache";
import type { LlmService } from "../llm/types";
import type { TranscriptionServiceType } from "../transcription/types";
import type { UrlFetcherServiceType } from "../url-fetcher/types";

/** Document ingestion, chunking, embedding, and semantic search. */
export class DocumentsService {
  private db: Database;
  private kernel: Kernel;
  private chunkIndex: VectorIndex;
  private onIngestCallback?: () => void;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.db = kernel.get<Database>("db");
    this.chunkIndex = new VectorIndex(this.db, "chunks");
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
    // Transcribe audio/video files
    if (parseResult.format === "audio" || parseResult.format === "video") {
      const transcriptionService = this.kernel.get<TranscriptionServiceType>("transcription");
      const transcription = await transcriptionService.transcribe(filePath);
      parseResult.content = transcription.text;
      parseResult.metadata = {
        ...parseResult.metadata,
        language: transcription.language,
        duration: transcription.duration,
        transcription_segments: transcription.segments,
      };
    }

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

    // Store parsed metadata as JSON
    const metaJson = parseResult.metadata ? JSON.stringify(parseResult.metadata) : null;
    const transcription = parseResult.format === "audio" || parseResult.format === "video"
      ? parseResult.content
      : null;

    // Insert document
    this.db
      .query(
        "INSERT INTO documents (id, title, source_path, source_type, content_hash, mime_type, file_size, chunk_count, metadata, description, transcription) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(docId, title, filePath, "file", hash, file.type, file.size, chunks.length, metaJson, null, transcription);

    // Insert chunks + embeddings
    const llm = this.kernel.get<LlmService>("llm");
    await embedAndInsertChunks(this.db, chunks, docId, llm);

    this.onIngestCallback?.();
    return { id: docId, title, chunkCount: chunks.length };
  }

  async ingestUrl(url: string, description?: string): Promise<IngestResult> {
    const urlFetcher = this.kernel.get<UrlFetcherServiceType>("urlFetcher");
    const result = await urlFetcher.fetchUrl(url);

    const content = result.content;
    if (!content || content.trim().length === 0) {
      throw new Error("No content could be extracted from URL");
    }

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
    const title = result.title || new URL(url).hostname;
    const docDescription = description || result.description || null;

    const chunkSize = settings.get("rag.chunk_size") as number;
    const chunkOverlap = settings.get("rag.chunk_overlap") as number;
    const chunkMode = settings.get("rag.chunk_mode") as string;
    const chunks = chunkMode === "semantic"
      ? chunkTextSemantic(content, chunkSize)
      : chunkText(content, chunkSize, chunkOverlap);

    this.db
      .query(
        "INSERT INTO documents (id, title, source_path, source_type, content_hash, mime_type, file_size, chunk_count, metadata, description, transcription) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(docId, title, url, "url", hash, result.contentType, content.length, chunks.length, null, docDescription, null);

    const llm = this.kernel.get<LlmService>("llm");
    await embedAndInsertChunks(this.db, chunks, docId, llm);

    this.onIngestCallback?.();
    return { id: docId, title, chunkCount: chunks.length };
  }

  onIngest(cb: () => void): void {
    this.onIngestCallback = cb;
  }

  invalidateIndex(): void {
    this.chunkIndex.invalidate();
  }

  getCacheStats(): { embedding: CacheStats } {
    return {
      embedding: embeddingCache.stats(),
    };
  }

  clearCache(): void {
    embeddingCache.clear();
  }

  list(options: { page?: number; perPage?: number; sort?: string } = {}): {
    documents: Document[];
    total: number;
    page: number;
    perPage: number;
  } {
    const { page, perPage, offset } = parsePagination(options);

    const total = countRows(this.db, "documents");
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
    return deleteById(this.db, "documents", id);
  }

  async batchIngest(filePaths: string[]): Promise<BatchIngestResult> {
    const results: IngestResult[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    const BATCH_SIZE = 4;

    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map((filePath) => this.ingest(filePath))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const outcome = batchResults[j]!;
        if (outcome.status === "fulfilled") {
          results.push(outcome.value);
        } else {
          errors.push({
            path: batch[j]!,
            error: outcome.reason instanceof Error ? outcome.reason.message : "Unknown error",
          });
        }
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
      throw new NotFoundError("Document", id);
    }
    if (!doc.source_path) {
      throw new NotFoundError("Document source path", id);
    }

    // Delete old chunks
    this.db.query("DELETE FROM chunks WHERE document_id = ?").run(id);
    this.invalidateIndex();

    // Re-parse file
    const file = Bun.file(doc.source_path);
    if (!await file.exists()) {
      throw new NotFoundError("Source file", doc.source_path);
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

    // Store parsed metadata as JSON
    const metaJson = parseResult.metadata ? JSON.stringify(parseResult.metadata) : null;

    // Update document
    this.db
      .query("UPDATE documents SET content_hash = ?, chunk_count = ?, file_size = ?, metadata = ?, updated_at = datetime('now') WHERE id = ?")
      .run(hash, chunks.length, file.size, metaJson, id);

    // Insert new chunks
    const llm = this.kernel.get<LlmService>("llm");
    await embedAndInsertChunks(this.db, chunks, id, llm);

    return { id: doc.id, title: doc.title, chunkCount: chunks.length };
  }

  getStatus(): DocumentStatus {
    const total = countRows(this.db, "documents");
    const totalChunks = countRows(this.db, "chunks");
    const lastDoc = this.db.query("SELECT MAX(updated_at) as last FROM documents").get() as { last: string | null };
    return {
      total,
      totalChunks,
      lastIngestedAt: lastDoc?.last ?? null,
    };
  }

  async suggestQuestions(documentId?: string, count: number = 5): Promise<string[]> {
    const llm = this.kernel.get<LlmService>("llm");

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

    const response = await collectLlmResponse(llm, messages);

    const questions = extractJsonFromLlm<string[]>(response, /\[[\s\S]*\]/);
    if (questions && Array.isArray(questions)) {
      return questions.filter((q: unknown) => typeof q === "string").slice(0, count);
    }

    return [];
  }
}
