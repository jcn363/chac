import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { generateId } from "../../utils/id";
import { contentHash } from "../../utils/hash";
import { chunkText } from "../../utils/chunking";
import { embeddingToBlob, blobToEmbedding, cosineSimilarity } from "../../utils/vector";
import type { Document, SearchResult, IngestResult } from "./types";

export class DocumentsService {
  private db: Database;
  private kernel: Kernel;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.db = kernel.get<Database>("db");
  }

  async ingest(filePath: string): Promise<IngestResult> {
    const file = Bun.file(filePath);
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
    const title = filePath.split("/").pop() ?? "Untitled";
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

    // Insert chunks + embeddings
    const llm = this.kernel.get<{ embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> } }>("llm");

    const insertChunk = this.db.query(
      "INSERT INTO chunks (id, document_id, chunk_index, content, token_count, embedding, embedding_model, embedding_dimensions) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );

    const insertAll = this.db.transaction(async () => {
      for (const chunk of chunks) {
        const embResult = await llm.embeddings.create({ input: chunk.content });
        const embedding = embResult.data[0].embedding;
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
    });

    await insertAll();

    return { id: docId, title, chunkCount: chunks.length };
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
    const queryVec = new Float32Array(embResult.data[0].embedding);

    const rows = this.db
      .query("SELECT id, content, document_id, embedding FROM chunks WHERE embedding IS NOT NULL")
      .all() as Array<{ id: string; content: string; document_id: string; embedding: Buffer }>;

    const scored = rows.map((row) => ({
      chunkId: row.id,
      content: row.content,
      documentId: row.document_id,
      score: cosineSimilarity(queryVec, blobToEmbedding(row.embedding)),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
