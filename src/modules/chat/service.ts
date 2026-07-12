import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import { generateId } from "../../utils/id";
import { VectorIndex } from "../../utils/vector-index";
import type { ChatSession, ChatMessage, SendMessageOptions } from "./types";

const RRF_K = 60;

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

    // Fused retrieval
    const contextChunks = await this.retrieveContextFused(content);

    // Build messages for LLM
    const session = this.getSession(sessionId);
    if (!session) throw new Error("Session not found");
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

    // Memory context (cross-session)
    const memory = this.kernel.get<{ buildContextString: () => string }>("memory");
    const memoryContext = memory.buildContextString();
    if (memoryContext) {
      messages.push({
        role: "system",
        content: `User context from previous sessions:\n${memoryContext}`,
      });
    }

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

    // Token-aware context budget for history
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    const ctxSize = settings.get("llm.chat.ctx_size") as number;
    const history = this.buildHistoryBudget(sessionId, ctxSize, messages);
    for (const msg of history) {
      messages.push(msg);
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

    // Post-response: extract memory and compound knowledge (fire-and-forget)
    this.extractMemory(content, fullResponse).catch(() => {});
    this.compoundKnowledge(contextChunks, fullResponse).catch(() => {});

    const message = this.db
      .query("SELECT * FROM chat_messages WHERE id = ?")
      .get(assistantMsgId) as ChatMessage;

    options.onDone?.(message);
    return message;
  }

  private async extractMemory(userMessage: string, assistantMessage: string): Promise<void> {
    const memory = this.kernel.get<{ extractFromConversation: (u: string, a: string) => Promise<void> }>("memory");
    await memory.extractFromConversation(userMessage, assistantMessage);
  }

  private async compoundKnowledge(
    contextChunks: Array<{ chunkId: string; content: string; score: number }>,
    response: string
  ): Promise<void> {
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    const autoCompound = settings.get("rag.auto_compound") as boolean;
    if (!autoCompound) return;
    if (contextChunks.length === 0) return;
    if (response.length < 50) return;

    const wiki = this.kernel.get<{ updatePageInsight: (pageId: string, insight: string) => Promise<void> }>("wiki");

    const chunkIds = contextChunks.slice(0, 3).map((c) => c.chunkId);
    for (const chunkId of chunkIds) {
      const chunk = this.db
        .query("SELECT document_id FROM chunks WHERE id = ?")
        .get(chunkId) as { document_id: string } | undefined;
      if (!chunk) continue;

      const wikiPage = this.db
        .query("SELECT id FROM wiki_pages WHERE source_document_ids LIKE ?")
        .get(`%"${chunk.document_id}"%`) as { id: string } | undefined;
      if (!wikiPage) continue;

      const llm = this.kernel.get<{
        chat: { completions: (opts: { messages: Array<{ role: string; content: string }>; stream: boolean }) => AsyncGenerator<string> };
      }>("llm");

      const chunkData = contextChunks.find((c) => c.chunkId === chunkId);
      const chunkContent = chunkData?.content.slice(0, 500) ?? "";

      const messages = [
        {
          role: "system",
          content:
            "Extract one key insight from this Q&A that would improve a wiki entry. Return only the insight text, no formatting.",
        },
        {
          role: "user",
          content: `Context: ${chunkContent}\n\nQ: User asked about the context\nA: ${response.slice(0, 500)}`,
        },
      ];

      let insight = "";
      for await (const chunk of llm.chat.completions({ messages, stream: false })) {
        insight += chunk;
      }

      if (insight.length > 20) {
        await wiki.updatePageInsight(wikiPage.id, insight);
      }
    }
  }

  private async embedQuery(query: string): Promise<Float32Array> {
    const llm = this.kernel.get<{
      embeddings: { create: (opts: { input: string }) => Promise<{ data: { embedding: number[] }[] }> };
    }>("llm");
    const embResult = await llm.embeddings.create({ input: query });
    const firstEmb = embResult.data[0];
    if (!firstEmb) throw new Error("No embedding returned");
    return new Float32Array(firstEmb.embedding);
  }

  private async retrieveContextFused(
    query: string
  ): Promise<Array<{ chunkId: string; content: string; score: number }>> {
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    const wikiThreshold = settings.get("rag.wiki_threshold") as number;
    const maxChunks = settings.get("rag.max_chunks") as number;

    const queryVec = await this.embedQuery(query);

    const [wikiRaw, chunkRaw] = await Promise.all([
      this.wikiIndex.search(this.db, "wiki_pages", "id", "content", queryVec, {
        threshold: wikiThreshold,
      }),
      this.chunkIndex.search(this.db, "chunks", "id", "content", queryVec, { limit: maxChunks }),
    ]);

    // Reciprocal Rank Fusion
    const scores = new Map<string, { chunkId: string; content: string; score: number; source: string }>();

    for (let rank = 0; rank < wikiRaw.length; rank++) {
      const r = wikiRaw[rank]!;
      const rrfScore = 1 / (RRF_K + rank + 1);
      scores.set(`wiki:${r.id}`, {
        chunkId: r.id,
        content: r.content,
        score: rrfScore,
        source: "wiki",
      });
    }

    for (let rank = 0; rank < chunkRaw.length; rank++) {
      const r = chunkRaw[rank]!;
      const rrfScore = 1 / (RRF_K + rank + 1);
      const key = `chunk:${r.id}`;
      const existing = scores.get(key);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(key, {
          chunkId: r.id,
          content: r.content,
          score: rrfScore,
          source: "chunk",
        });
      }
    }

    const fused = Array.from(scores.values());
    fused.sort((a, b) => b.score - a.score);
    return fused.slice(0, maxChunks).map((r) => ({
      chunkId: r.chunkId,
      content: r.content,
      score: r.score,
    }));
  }

  private buildHistoryBudget(
    sessionId: string,
    ctxSize: number,
    currentMessages: Array<{ role: string; content: string }>
  ): Array<{ role: "user" | "assistant"; content: string }> {
    const responseBuffer = Math.floor(ctxSize * 0.3);
    const usedTokens = currentMessages.reduce(
      (sum, m) => sum + Math.ceil(m.content.length / 4),
      0
    );
    const historyBudget = Math.max(0, ctxSize - responseBuffer - usedTokens - 50);

    const allHistory = this.db
      .query(
        "SELECT * FROM chat_messages WHERE session_id = ? AND (role = 'user' OR role = 'assistant') ORDER BY created_at DESC"
      )
      .all(sessionId) as ChatMessage[];

    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    let tokensUsed = 0;

    for (let i = allHistory.length - 1; i >= 0; i--) {
      const msg = allHistory[i]!;
      if (msg.role !== "user" && msg.role !== "assistant") continue;
      const msgTokens = Math.ceil(msg.content.length / 4);
      if (tokensUsed + msgTokens > historyBudget) break;
      history.unshift({ role: msg.role, content: msg.content });
      tokensUsed += msgTokens;
    }

    return history;
  }

  exportSession(sessionId: string): { session: ChatSession; messages: ChatMessage[] } | undefined {
    const session = this.getSession(sessionId);
    if (!session) return undefined;
    const messages = this.getMessages(sessionId);
    return { session, messages };
  }

  importSession(data: { session: Partial<ChatSession>; messages: Array<Partial<ChatMessage>> }): ChatSession {
    const newSession = this.createSession({
      title: data.session.title ?? "Imported Conversation",
      systemPrompt: data.session.system_prompt ?? undefined,
    });

    for (const msg of data.messages) {
      const id = generateId();
      const validRoles = ["user", "assistant", "system", "tool"] as const;
      const role: "user" | "assistant" | "system" | "tool" =
        msg.role && validRoles.includes(msg.role as "user") ? msg.role as "user" | "assistant" | "system" | "tool" : "user";
      this.db
        .query(
          "INSERT INTO chat_messages (id, session_id, role, content, context_chunks, context_scores, prompt_tokens, completion_tokens, total_tokens, model, latency_ms, metadata, created_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(
          id,
          newSession.id,
          role,
          msg.content ?? "",
          msg.context_chunks ?? null,
          msg.context_scores ?? null,
          msg.prompt_tokens ?? null,
          msg.completion_tokens ?? null,
          msg.total_tokens ?? null,
          msg.model ?? null,
          msg.latency_ms ?? null,
          msg.metadata ?? null,
          msg.created_at ?? new Date().toISOString()
        );
    }

    return newSession;
  }

  invalidateIndexes(): void {
    this.wikiIndex.invalidate();
    this.chunkIndex.invalidate();
  }
}
