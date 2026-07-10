import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { generateId } from "../../utils/id";
import { contentHash } from "../../utils/hash";
import { embeddingToBlob } from "../../utils/vector";
import type { WikiPage } from "./types";

export class WikiService {
  private db: Database;
  private kernel: Kernel;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.db = kernel.get<Database>("db");
  }

  async compile(): Promise<WikiPage[]> {
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    const maxChars = settings.get("rag.max_wiki_chars") as number;
    const documents = this.db.query("SELECT * FROM documents").all() as Array<{
      id: string;
      title: string;
    }>;

    const llm = this.kernel.get<{
      chat: { completions: (opts: { messages: Array<{ role: string; content: string }>; stream: boolean }) => AsyncGenerator<string> };
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }>("llm");

    const results: WikiPage[] = [];

    for (const doc of documents) {
      const chunks = this.db
        .query("SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index")
        .all(doc.id) as Array<{ content: string }>;

      const fullContent = chunks.map((c) => c.content).join("\n").slice(0, maxChars);

      // Synthesize wiki entry
      const messages = [
        {
          role: "system",
          content:
            "You are a wiki compiler. Synthesize the following document into a structured wiki entry. " +
            "Include: title, key concepts, important facts, and a summary. Format as Markdown.",
        },
        { role: "user", content: fullContent },
      ];

      let wikiContent = "";
      for await (const chunk of llm.chat.completions({ messages, stream: true })) {
        wikiContent += chunk;
      }

      // Generate embedding
      const embResult = await llm.embeddings.create({ input: wikiContent });
      const firstEmb = embResult.data[0];
      if (!firstEmb) throw new Error("No embedding returned");
      const embedding = firstEmb.embedding;
      const blob = embeddingToBlob(embedding);

      // Create or update wiki page
      const slug = doc.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const hash = await contentHash(wikiContent);

      const existing = this.db
        .query("SELECT id FROM wiki_pages WHERE slug = ?")
        .get(slug) as { id: string } | undefined;

      if (existing) {
        this.db
          .query(
            "UPDATE wiki_pages SET content = ?, content_hash = ?, embedding = ?, " +
              "source_document_ids = ?, version = version + 1, updated_at = datetime('now') WHERE id = ?"
          )
          .run(wikiContent, hash, blob, JSON.stringify([doc.id]), existing.id);
      } else {
        const pageId = generateId();
        this.db
          .query(
            "INSERT INTO wiki_pages (id, title, slug, content, content_hash, embedding, source_document_ids) " +
              "VALUES (?, ?, ?, ?, ?, ?, ?)"
          )
          .run(pageId, doc.title, slug, wikiContent, hash, blob, JSON.stringify([doc.id]));
      }

      const page = this.db
        .query("SELECT * FROM wiki_pages WHERE slug = ?")
        .get(slug) as WikiPage;
      results.push(page);
    }

    return results;
  }

  list(options: { page?: number; perPage?: number } = {}): {
    pages: WikiPage[];
    total: number;
  } {
    const page = options.page ?? 1;
    const perPage = options.perPage ?? 20;
    const offset = (page - 1) * perPage;

    const total = (this.db.query("SELECT COUNT(*) as count FROM wiki_pages").get() as { count: number }).count;
    const pages = this.db
      .query("SELECT * FROM wiki_pages ORDER BY updated_at DESC LIMIT ? OFFSET ?")
      .all(perPage, offset) as WikiPage[];

    return { pages, total };
  }

  get(id: string): WikiPage | undefined {
    const row = this.db.query("SELECT * FROM wiki_pages WHERE id = ?").get(id);
    return row ? (row as WikiPage) : undefined;
  }

  delete(id: string): boolean {
    const result = this.db.query("DELETE FROM wiki_pages WHERE id = ?").run(id);
    return result.changes > 0;
  }

  async search(query: string, options: { limit?: number } = {}): Promise<Array<WikiPage & { score: number }>> {
    const limit = options.limit ?? 3;
    const llm = this.kernel.get<{
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }>("llm");
    const { blobToEmbedding, cosineSimilarity } = await import("../../utils/vector");

    const embResult = await llm.embeddings.create({ input: query });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    const queryVec = new Float32Array(firstEmb.embedding);

    const pages = this.db
      .query("SELECT * FROM wiki_pages WHERE embedding IS NOT NULL")
      .all() as Array<WikiPage & { embedding: Buffer }>;

    return pages
      .map((p) => ({
        ...p,
        score: cosineSimilarity(queryVec, blobToEmbedding(p.embedding)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
