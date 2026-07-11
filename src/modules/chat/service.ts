import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { generateId } from "../../utils/id";
import { VectorIndex } from "../../utils/vector-index";
import type { ChatSession, ChatMessage, SendMessageOptions } from "./types";

export class ChatService {
  private db: Database;
  private kernel: Kernel;
  private wikiIndex = new VectorIndex();
  private chunkIndex = new VectorIndex();

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
      .query("SELECT * FROM chat_sessions ORDER BY sort_order ASC, updated_at DESC")
      .all() as ChatSession[];
  }

  getSession(id: string): ChatSession | undefined {
    const row = this.db.query("SELECT * FROM chat_sessions WHERE id = ?").get(id);
    return row ? (row as ChatSession) : undefined;
  }

  deleteSession(id: string): boolean {
    const result = this.db.query("DELETE FROM chat_sessions WHERE id = ?").run(id);
    return result.changes > 0;
  }

  updateSession(id: string, title: string): ChatSession | undefined {
    this.db.query("UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?").run(title, id);
    return this.getSession(id);
  }

  updateMessage(id: string, content: string): ChatMessage | undefined {
    this.db.query("UPDATE chat_messages SET content = ? WHERE id = ?").run(content, id);
    const row = this.db.query("SELECT * FROM chat_messages WHERE id = ?").get(id);
    return row ? (row as ChatMessage) : undefined;
  }

  deleteMessage(id: string): boolean {
    const result = this.db.query("DELETE FROM chat_messages WHERE id = ?").run(id);
    return result.changes > 0;
  }

  reorderSessions(ids: string[]): void {
    const stmt = this.db.query("UPDATE chat_sessions SET sort_order = ? WHERE id = ?");
    const updateAll = this.db.transaction((orderedIds: string[]) => {
      orderedIds.forEach((id, i) => stmt.run(i, id));
    });
    updateAll(ids);
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
    if (!session) throw new Error("Session not found");
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

    // Add history (before current message) — limit to last 20 messages for context
    const history = this.db
      .query("SELECT * FROM chat_messages WHERE session_id = ? AND (role = 'user' OR role = 'assistant') ORDER BY created_at DESC LIMIT 20")
      .all(sessionId) as ChatMessage[];
    history.reverse();
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

    const embResult = await llm.embeddings.create({ input: query });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    const queryVec = new Float32Array(firstEmb.embedding);

    const results = this.wikiIndex.search(this.db, "wiki_pages", "id", "content", queryVec, {
      threshold,
    });

    return results.map((r) => ({ pageId: r.id, content: r.content, score: r.score }));
  }

  private async searchChunks(
    query: string,
    limit: number
  ): Promise<Array<{ chunkId: string; content: string; score: number }>> {
    const llm = this.kernel.get<{
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }>("llm");

    const embResult = await llm.embeddings.create({ input: query });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    const queryVec = new Float32Array(firstEmb.embedding);

    const results = this.chunkIndex.search(this.db, "chunks", "id", "content", queryVec, { limit });
    return results.map((r) => ({ chunkId: r.id, content: r.content, score: r.score }));
  }

  invalidateIndexes(): void {
    this.wikiIndex.invalidate();
    this.chunkIndex.invalidate();
  }
}
