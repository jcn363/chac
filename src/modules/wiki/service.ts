import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { generateId } from "../../utils/id";
import { contentHash } from "../../utils/hash";
import { embeddingToBlob, blobToEmbedding } from "../../utils/vector";
import { VectorIndex } from "../../utils/vector-index";
import type { WikiPage } from "./types";

export class WikiService {
  private db: Database;
  private kernel: Kernel;
  private wikiIndex = new VectorIndex();

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.db = kernel.get<Database>("db");
  }

  async compile(): Promise<WikiPage[]> {
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    const maxChars = settings.get("rag.max_wiki_chars") as number;
    const agentsEnabled = settings.get("wiki.agents_enabled") as boolean;
    const documents = this.db.query("SELECT * FROM documents").all() as Array<{
      id: string;
      title: string;
    }>;

    const llm = this.kernel.get<{
      chat: { completions: (opts: { messages: Array<{ role: string; content: string }>; stream: boolean }) => AsyncGenerator<string> };
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }>("llm");

    const results: WikiPage[] = [];

    const CONCURRENCY = 4;
    const processDoc = async (doc: { id: string; title: string }): Promise<WikiPage> => {
      const chunks = this.db
        .query("SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index")
        .all(doc.id) as Array<{ content: string }>;

      const fullContent = chunks.map((c) => c.content).join("\n").slice(0, maxChars);

      let wikiContent: string;
      if (agentsEnabled) {
        wikiContent = await this.compileWithAgents(fullContent, llm);
      } else {
        wikiContent = await this.compileSinglePass(fullContent, llm);
      }

      const embResult = await llm.embeddings.create({ input: wikiContent });
      const firstEmb = embResult.data[0];
      if (!firstEmb) throw new Error("No embedding returned");
      const embedding = firstEmb.embedding;
      const blob = embeddingToBlob(embedding);

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

      return this.db.query("SELECT * FROM wiki_pages WHERE slug = ?").get(slug) as WikiPage;
    };

    for (let i = 0; i < documents.length; i += CONCURRENCY) {
      const batch = documents.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(processDoc));
      results.push(...batchResults);
    }

    // Cross-document synthesis pass
    if (results.length >= 2) {
      const synthesisPages = await this.synthesizeCrossReferences(results, llm);
      results.push(...synthesisPages);
    }

    return results;
  }

  private async compileSinglePass(
    content: string,
    llm: { chat: { completions: (opts: { messages: Array<{ role: string; content: string }>; stream: boolean }) => AsyncGenerator<string> } }
  ): Promise<string> {
    const messages = [
      {
        role: "system",
        content:
          "You are a wiki compiler. Synthesize the following document into a structured wiki entry. " +
          "Include: title, key concepts, important facts, and a summary. Format as Markdown.",
      },
      { role: "user", content },
    ];

    let result = "";
    for await (const chunk of llm.chat.completions({ messages, stream: true })) {
      result += chunk;
    }
    return result;
  }

  private async compileWithAgents(
    content: string,
    llm: { chat: { completions: (opts: { messages: Array<{ role: string; content: string }>; stream: boolean }) => AsyncGenerator<string> } }
  ): Promise<string> {
    const agentPrompts = [
      { role: "system", content: "Create a concise summary of this document. Focus on the main topic and key takeaways. Format as Markdown." },
      { role: "system", content: "Extract all key facts, definitions, statistics, and technical details. Format as a structured list." },
      { role: "system", content: "Identify how this document relates to other topics. What concepts does it build on? What would someone learn next? Format as Markdown." },
    ];

    const agentOutputs = await Promise.all(
      agentPrompts.map(async (prompt) => {
        const messages = [prompt, { role: "user", content }];
        let output = "";
        for await (const chunk of llm.chat.completions({ messages, stream: true })) {
          output += chunk;
        }
        return output;
      })
    );

    const mergeMessages = [
      {
        role: "system",
        content:
          "Combine these three analyses into one comprehensive wiki entry. " +
          "Include: title, summary, key facts, and connections to related topics. Format as Markdown.",
      },
      {
        role: "user",
        content: `Summary:\n${agentOutputs[0]}\n\nFacts:\n${agentOutputs[1]}\n\nConnections:\n${agentOutputs[2]}`,
      },
    ];

    let merged = "";
    for await (const chunk of llm.chat.completions({ messages: mergeMessages, stream: true })) {
      merged += chunk;
    }
    return merged;
  }

  async updatePageInsight(pageId: string, insight: string): Promise<void> {
    const page = this.db.query("SELECT * FROM wiki_pages WHERE id = ?").get(pageId) as WikiPage | undefined;
    if (!page) return;

    const updatedContent = page.content + "\n\n## Derived Insight\n" + insight;
    const hash = await contentHash(updatedContent);

    const llm = this.kernel.get<{
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }>("llm");

    const embResult = await llm.embeddings.create({ input: updatedContent });
    const firstEmb = embResult.data[0];
    if (!firstEmb) return;
    const blob = embeddingToBlob(firstEmb.embedding);

    this.db
      .query(
        "UPDATE wiki_pages SET content = ?, content_hash = ?, embedding = ?, " +
          "version = version + 1, updated_at = datetime('now') WHERE id = ?"
      )
      .run(updatedContent, hash, blob, pageId);

    this.wikiIndex.invalidate();
  }

  private async synthesizeCrossReferences(
    pages: WikiPage[],
    llm: {
      chat: { completions: (opts: { messages: Array<{ role: string; content: string }>; stream: boolean }) => AsyncGenerator<string> };
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }
  ): Promise<WikiPage[]> {
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    const threshold = settings.get("rag.wiki_synthesis_threshold") as number;

    const embeddings: Array<{ page: WikiPage; vec: Float32Array }> = [];
    for (const page of pages) {
      const row = this.db.query("SELECT embedding FROM wiki_pages WHERE id = ?").get(page.id) as { embedding: Buffer } | undefined;
      if (row?.embedding) {
        embeddings.push({ page, vec: blobToEmbedding(row.embedding) });
      }
    }

    if (embeddings.length < 2) return [];

    const parent = new Map<number, number>();
    const find = (x: number): number => {
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
      return parent.get(x)!;
    };
    const union = (a: number, b: number) => {
      parent.set(find(a), find(b));
    };

    for (let i = 0; i < embeddings.length; i++) {
      parent.set(i, i);
    }

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const a = embeddings[i]!;
        const b = embeddings[j]!;
        let dot = 0;
        let normA = 0;
        let normB = 0;
        const len = Math.min(a.vec.length, b.vec.length);
        for (let k = 0; k < len; k++) {
          dot += a.vec[k]! * b.vec[k]!;
          normA += a.vec[k]! * a.vec[k]!;
          normB += b.vec[k]! * b.vec[k]!;
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        const sim = denom === 0 ? 0 : dot / denom;
        if (sim >= threshold) {
          union(i, j);
        }
      }
    }

    const groups = new Map<number, number[]>();
    for (let i = 0; i < embeddings.length; i++) {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push(i);
    }

    const synthesisPages: WikiPage[] = [];

    for (const [, indices] of groups) {
      if (indices.length < 2) continue;

      const groupPages = indices.map((i) => embeddings[i]!.page);
      const titles = groupPages.map((p) => p.title).join(", ");
      const contents = groupPages.map((p) => `- ${p.title}: ${p.content.slice(0, 500)}`).join("\n");

      const messages = [
        {
          role: "system",
          content:
            "You are a wiki synthesizer. Create a cross-reference entry that connects these related wiki pages. " +
            "Highlight relationships, shared concepts, and how they complement each other. Format as Markdown.",
        },
        {
          role: "user",
          content: `Related wiki pages:\n${contents}`,
        },
      ];

      let synthesisContent = "";
      for await (const chunk of llm.chat.completions({ messages, stream: true })) {
        synthesisContent += chunk;
      }

      const embResult = await llm.embeddings.create({ input: synthesisContent });
      const firstEmb = embResult.data[0];
      if (!firstEmb) continue;
      const blob = embeddingToBlob(firstEmb.embedding);

      const slug = `synthesis-${indices.join("-")}`;
      const hash = await contentHash(synthesisContent);
      const allDocIds = [...new Set(groupPages.flatMap((p) => {
        try { return JSON.parse(p.source_document_ids ?? "[]") as string[]; }
        catch { return []; }
      }))];

      const pageId = generateId();
      this.db
        .query(
          "INSERT OR REPLACE INTO wiki_pages (id, title, slug, content, content_hash, embedding, source_document_ids) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .run(pageId, `Synthesis: ${titles}`, slug, synthesisContent, hash, blob, JSON.stringify(allDocIds));

      synthesisPages.push(this.db.query("SELECT * FROM wiki_pages WHERE id = ?").get(pageId) as WikiPage);
    }

    return synthesisPages;
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

    const embResult = await llm.embeddings.create({ input: query });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    const queryVec = new Float32Array(firstEmb.embedding);

    const results = this.wikiIndex.search(this.db, "wiki_pages", "id", "content", queryVec, { limit });

    return results.map((r) => {
      const page = this.db.query("SELECT * FROM wiki_pages WHERE id = ?").get(r.id) as WikiPage;
      return { ...page, score: r.score };
    });
  }

  invalidateIndex(): void {
    this.wikiIndex.invalidate();
  }
}
