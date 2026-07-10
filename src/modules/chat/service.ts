import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { generateId } from "../../utils/id";
import type { ChatSession, ChatMessage, SendMessageOptions } from "./types";

export class ChatService {
  private db: Database;
  private kernel: Kernel;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.db = kernel.get<Database>("db");
  }

  createSession(options: { title?: string; systemPrompt?: string } = {}): ChatSession {
    const id = generateId();
    this.db
      .query("INSERT INTO chat_sessions (id, title, system_prompt) VALUES (?, ?, ?)")
      .run(id, options.title ?? null, options.systemPrompt ?? null);
    return this.db.query("SELECT * FROM chat_sessions WHERE id = ?").get(id) as ChatSession;
  }

  listSessions(): ChatSession[] {
    return this.db
      .query("SELECT * FROM chat_sessions ORDER BY updated_at DESC")
      .all() as ChatSession[];
  }

  getSession(id: string): ChatSession | undefined {
    const row = this.db.query("SELECT * FROM chat_sessions WHERE id = ?").get(id);
    return row ? (row as ChatSession) : undefined;
  }

  getMessages(sessionId: string): ChatMessage[] {
    return this.db
      .query("SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at")
      .all(sessionId) as ChatMessage[];
  }

  async sendMessage(
    sessionId: string,
    content: string,
    options: SendMessageOptions = {}
  ): Promise<ChatMessage> {
    const startTime = Date.now();

    // Two-tier retrieval
    const contextChunks = await this.retrieveContext(content);

    // Build messages for LLM — query history BEFORE inserting user message
    const session = this.getSession(sessionId);
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

    if (session?.system_prompt) {
      messages.push({ role: "system", content: session.system_prompt });
    }

    if (contextChunks.length > 0) {
      const contextBlock = contextChunks
        .map((c, i) => `[${i + 1}] ${c.content}`)
        .join("\n\n");
      messages.push({
        role: "system",
        content: `Context from documents:\n${contextBlock}\n\nAnswer based on this context when relevant.`,
      });
    }

    // Add history (before current message)
    const history = this.getMessages(sessionId);
    for (const msg of history) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: "user", content });

    // Save user message AFTER building context
    const userMsgId = generateId();
    this.db
      .query(
        "INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, 'user', ?)"
      )
      .run(userMsgId, sessionId, content);

    // Stream response
    const llm = this.kernel.get<{
      chat: { completions: (opts: { messages: typeof messages; stream: boolean }) => AsyncGenerator<string> };
    }>("llm");

    let fullResponse = "";
    for await (const chunk of llm.chat.completions({ messages, stream: true })) {
      fullResponse += chunk;
      options.onChunk?.(chunk);
    }

    const latencyMs = Date.now() - startTime;

    // Save assistant message
    const assistantMsgId = generateId();
    this.db
      .query(
        "INSERT INTO chat_messages (id, session_id, role, content, context_chunks, context_scores, latency_ms) " +
          "VALUES (?, ?, 'assistant', ?, ?, ?, ?)"
      )
      .run(
        assistantMsgId,
        sessionId,
        fullResponse,
        JSON.stringify(contextChunks.map((c) => c.chunkId)),
        JSON.stringify(contextChunks.map((c) => c.score)),
        latencyMs
      );

    // Update session timestamp
    this.db
      .query("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?")
      .run(sessionId);

    const message = this.db
      .query("SELECT * FROM chat_messages WHERE id = ?")
      .get(assistantMsgId) as ChatMessage;

    options.onDone?.(message);
    return message;
  }

  private async retrieveContext(
    query: string
  ): Promise<Array<{ chunkId: string; content: string; score: number }>> {
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    const wikiThreshold = settings.get("rag.wiki_threshold") as number;
    const maxChunks = settings.get("rag.max_chunks") as number;

    // Try wiki first
    const wikiResults = await this.searchWiki(query, wikiThreshold);
    if (wikiResults.length > 0) {
      return wikiResults.map((r) => ({
        chunkId: r.pageId,
        content: r.content,
        score: r.score,
      }));
    }

    // Fallback to raw chunks
    return this.searchChunks(query, maxChunks);
  }

  private async searchWiki(
    query: string,
    threshold: number
  ): Promise<Array<{ pageId: string; content: string; score: number }>> {
    const llm = this.kernel.get<{
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }>("llm");
    const { blobToEmbedding, cosineSimilarity } = await import("../../utils/vector");

    const embResult = await llm.embeddings.create({ input: query });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    const queryVec = new Float32Array(firstEmb.embedding);

    const pages = this.db
      .query("SELECT id, content, embedding FROM wiki_pages WHERE embedding IS NOT NULL")
      .all() as Array<{ id: string; content: string; embedding: Buffer }>;

    const scored = pages
      .map((p) => ({
        pageId: p.id,
        content: p.content,
        score: cosineSimilarity(queryVec, blobToEmbedding(p.embedding)),
      }))
      .filter((s) => s.score >= threshold)
      .sort((a, b) => b.score - a.score);

    return scored;
  }

  private async searchChunks(
    query: string,
    limit: number
  ): Promise<Array<{ chunkId: string; content: string; score: number }>> {
    const llm = this.kernel.get<{
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }>("llm");
    const { blobToEmbedding, cosineSimilarity } = await import("../../utils/vector");

    const embResult = await llm.embeddings.create({ input: query });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    const queryVec = new Float32Array(firstEmb.embedding);

    const rows = this.db
      .query("SELECT id, content, embedding FROM chunks WHERE embedding IS NOT NULL")
      .all() as Array<{ id: string; content: string; embedding: Buffer }>;

    return rows
      .map((r) => ({
        chunkId: r.id,
        content: r.content,
        score: cosineSimilarity(queryVec, blobToEmbedding(r.embedding)),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
