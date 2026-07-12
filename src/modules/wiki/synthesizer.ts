import type { Database } from "bun:sqlite";
import type { LlmService, ChatMessage } from "../llm/types";
import type { SettingsServiceType } from "../settings/types";
import { VectorIndex } from "../../utils/vector-index";
import { blobToEmbedding, embeddingToBlob, cosineSimilarity } from "../../utils/vector";
import { generateId } from "../../utils/id";
import { contentHash } from "../../utils/hash";
import type { WikiPage } from "./types";

export type EmbeddingLLM = LlmService;

/** Cross-document synthesis using Union-Find clustering over embeddings. */
export class WikiSynthesizer {
  constructor(
    private db: Database,
    private llm: EmbeddingLLM,
    private wikiIndex: VectorIndex,
    private settings: SettingsServiceType
  ) {}

  async synthesizeCrossReferences(pages: WikiPage[]): Promise<WikiPage[]> {
    const threshold = this.settings.get("rag.wiki_synthesis_threshold") as number;

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
        const sim = cosineSimilarity(a.vec, b.vec);
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

      const messages: ChatMessage[] = [
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
      for await (const chunk of this.llm.chat.completions({ messages, stream: true })) {
        synthesisContent += chunk;
      }

      const embResult = await this.llm.embeddings.create({ input: synthesisContent });
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
}
