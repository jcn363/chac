import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { generateId } from "../../utils/id";
import { contentHash } from "../../utils/hash";
import { chunkText } from "../../utils/chunking";
import { embeddingToBlob } from "../../utils/vector";
import { VectorIndex } from "../../utils/vector-index";
import type { Document, SearchResult, IngestResult } from "./types";
import { basename, resolve } from "node:path";
import { getAppRoot } from "../../platform/paths";

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

    const content = await file.text();
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
    const chunks = chunkText(content, chunkSize, chunkOverlap);

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

  async search(query: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
    const limit = options.limit ?? 5;
    const llm = this.kernel.get<{ embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> } }>("llm");
    const embResult = await llm.embeddings.create({ input: query });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    const queryVec = new Float32Array(firstEmb.embedding);

    // Get document_id mapping
    const docMap = new Map<string, string>();
    const docRows = this.db.query("SELECT id, document_id FROM chunks").all() as Array<{ id: string; document_id: string }>;
    for (const row of docRows) {
      docMap.set(row.id, row.document_id);
    }

    const results = this.chunkIndex.search(this.db, "chunks", "id", "content", queryVec, { limit });

    return results.map((r) => ({
      chunkId: r.id,
      content: r.content,
      documentId: docMap.get(r.id) ?? "",
      score: r.score,
    }));
  }
}
