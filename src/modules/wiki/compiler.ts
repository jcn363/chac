import type { Database } from "bun:sqlite";
import type { ChatMessage } from "../llm/types";
import type { SettingsServiceType } from "../settings/types";
import type { DocumentsService } from "../documents/service";
import { embeddingToBlob } from "../../utils/vector";
import { generateId } from "../../utils/id";
import { contentHash } from "../../utils/hash";
import { WikiSynthesizer, type EmbeddingLLM } from "./synthesizer";
import type { WikiPage } from "./types";

/** Wiki compilation following the Karpathy Method. */
export class WikiCompiler {
  constructor(
    private db: Database,
    private llm: EmbeddingLLM,
    private docs: DocumentsService,
    private settings: SettingsServiceType,
    private synthesizer: WikiSynthesizer
  ) {}

  async compile(documentIds?: string[]): Promise<WikiPage[]> {
    const maxChars = this.settings.get("rag.max_wiki_chars") as number;
    const agentsEnabled = this.settings.get("wiki.agents_enabled") as boolean;

    let documents: Array<{ id: string; title: string }>;
    if (documentIds && documentIds.length > 0) {
      documents = documentIds
        .map((id) => this.db.query("SELECT id, title FROM documents WHERE id = ?").get(id) as { id: string; title: string } | undefined)
        .filter((d): d is { id: string; title: string } => d != null);
    } else {
      documents = this.db.query("SELECT id, title FROM documents").all() as Array<{
        id: string;
        title: string;
      }>;
    }

    const results: WikiPage[] = [];

    const CONCURRENCY = 4;
    const processDoc = async (doc: { id: string; title: string }): Promise<WikiPage> => {
      const chunks = this.db
        .query("SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index")
        .all(doc.id) as Array<{ content: string }>;

      const fullContent = chunks.map((c) => c.content).join("\n").slice(0, maxChars);

      let wikiContent: string;
      if (agentsEnabled) {
        wikiContent = await this.compileWithAgents(fullContent);
      } else {
        wikiContent = await this.compileSinglePass(fullContent);
      }

      const embResult = await this.llm.embeddings.create({ input: wikiContent });
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
      const synthesisPages = await this.synthesizer.synthesizeCrossReferences(results);
      results.push(...synthesisPages);
    }

    return results;
  }

  async updatePageInsight(pageId: string, insight: string): Promise<void> {
    const page = this.db.query("SELECT * FROM wiki_pages WHERE id = ?").get(pageId) as WikiPage | undefined;
    if (!page) return;

    const updatedContent = page.content + "\n\n## Derived Insight\n" + insight;
    const hash = await contentHash(updatedContent);

    const embResult = await this.llm.embeddings.create({ input: updatedContent });
    const firstEmb = embResult.data[0];
    if (!firstEmb) return;
    const blob = embeddingToBlob(firstEmb.embedding);

    this.db
      .query(
        "UPDATE wiki_pages SET content = ?, content_hash = ?, embedding = ?, " +
          "version = version + 1, updated_at = datetime('now') WHERE id = ?"
      )
      .run(updatedContent, hash, blob, pageId);
  }

  private async compileSinglePass(content: string): Promise<string> {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a wiki compiler. Synthesize the following document into a structured wiki entry. " +
          "Include: title, key concepts, important facts, and a summary. Format as Markdown.",
      },
      { role: "user", content },
    ];

    let result = "";
    for await (const chunk of this.llm.chat.completions({ messages, stream: true })) {
      result += chunk;
    }
    return result;
  }

  private async compileWithAgents(content: string): Promise<string> {
    const agentPrompts: ChatMessage[] = [
      { role: "system", content: "Create a concise summary of this document. Focus on the main topic and key takeaways. Format as Markdown." },
      { role: "system", content: "Extract all key facts, definitions, statistics, and technical details. Format as a structured list." },
      { role: "system", content: "Identify how this document relates to other topics. What concepts does it build on? What would someone learn next? Format as Markdown." },
    ];

    const agentOutputs = await Promise.all(
      agentPrompts.map(async (prompt) => {
        const messages: ChatMessage[] = [prompt, { role: "user", content }];
        let output = "";
        for await (const chunk of this.llm.chat.completions({ messages, stream: true })) {
          output += chunk;
        }
        return output;
      })
    );

    const mergeMessages: ChatMessage[] = [
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
    for await (const chunk of this.llm.chat.completions({ messages: mergeMessages, stream: true })) {
      merged += chunk;
    }
    return merged;
  }
}
