import type { Database } from "bun:sqlite";
import type { Kernel } from "../../kernel/types";
import type { LlmService } from "../llm/types";
import { generateId } from "../../utils/id";
import { VectorIndex } from "../../utils/vector-index";
import { deleteById } from "../../utils/db-helpers";
import { createLogger } from "../../utils/logger";
import type { ChatSession, ChatMessage, SendMessageOptions } from "./types";
import type { DocumentSearchService } from "../documents/search";
import type { SettingsServiceType } from "../settings/types";
import { RagRetriever, type RagResult } from "./rag";
import { NotFoundError } from "../../errors";

const log = createLogger("chat");

export type ContextChunk = RagResult;

/** Chat sessions, messages, and RAG context retrieval with ranked fusion. */
export class ChatService {
  private db: Database;
  private kernel: Kernel;
  private wikiIndex: VectorIndex;
  private chunkIndex: VectorIndex;
  private ragRetriever: RagRetriever;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.db = kernel.get<Database>("db");
    this.wikiIndex = kernel.get<VectorIndex>("wikiIndex");
    this.chunkIndex = kernel.get<VectorIndex>("chunkIndex");
    this.ragRetriever = new RagRetriever(
      this.db,
      kernel.get<LlmService>("llm"),
      kernel.get<DocumentSearchService>("search"),
      this.wikiIndex,
      this.chunkIndex,
      kernel.get<SettingsServiceType>("settings")
    );
  }

  createSession(options: { title?: string; systemPrompt?: string } = {}): ChatSession {
    const id = generateId();
    const authToken = generateId();
    this.db
      .query("INSERT INTO chat_sessions (id, title, system_prompt, auth_token) VALUES (?, ?, ?, ?)")
      .run(id, options.title ?? null, options.systemPrompt ?? null, authToken);
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

  validateSessionToken(sessionId: string, token: string): boolean {
    const row = this.db
      .query("SELECT id FROM chat_sessions WHERE id = ? AND auth_token = ?")
      .get(sessionId, token);
    return !!row;
  }

  validateSessionTokenByToken(token: string): ChatSession | undefined {
    const row = this.db
      .query("SELECT * FROM chat_sessions WHERE auth_token = ?")
      .get(token);
    return row ? (row as ChatSession) : undefined;
  }

  deleteSession(id: string): boolean {
    return deleteById(this.db, "chat_sessions", id);
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
    return deleteById(this.db, "chat_messages", id);
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

    // Build messages for LLM
    const session = this.getSession(sessionId);
    if (!session) throw new NotFoundError("ChatSession", sessionId);
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

    // RAG context building via RagRetriever
    const ragResult = await this.ragRetriever.buildContext(
      content,
      sessionId,
      memoryContext,
      session.system_prompt
    );
    const contextChunks = ragResult.contextChunks;

    if (ragResult.contextBlock) {
      messages.push({
        role: "system",
        content: `Context from documents:\n${ragResult.contextBlock}${ragResult.citationFooter}\n\nAnswer based on this context when relevant. Cite sources using [1], [2] etc.`,
      });
    }

    // Token-aware context budget for history
    for (const msg of ragResult.history) {
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
    const llm = this.kernel.get<LlmService>("llm");

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
        "INSERT INTO chat_messages (id, session_id, role, content, context_chunks, context_scores, latency_ms, citations) " +
          "VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?)"
      )
      .run(
        assistantMsgId,
        sessionId,
        fullResponse,
        JSON.stringify(contextChunks.map((c) => c.chunkId)),
        JSON.stringify(contextChunks.map((c) => c.score)),
        latencyMs,
        JSON.stringify(contextChunks.filter((c) => c.citation).map((c) => ({
          chunkId: c.chunkId,
          citation: c.citation,
          documentTitle: c.documentTitle,
          score: c.score,
        })))
      );

    // Update session timestamp
    this.db
      .query("UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?")
      .run(sessionId);

    // Post-response: extract memory and compound knowledge (fire-and-forget)
    this.extractMemory(content, fullResponse).catch((err) => {
      log.warn("Memory extraction failed", { error: err.message });
    });
    this.compoundKnowledge(contextChunks, fullResponse).catch((err) => {
      log.warn("Knowledge compaction failed", { error: err.message });
    });

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
    contextChunks: ContextChunk[],
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

      const llm = this.kernel.get<LlmService>("llm");

      const chunkData = contextChunks.find((c) => c.chunkId === chunkId);
      const chunkContent = chunkData?.content.slice(0, 500) ?? "";

      const messages = [
        {
          role: "system" as const,
          content:
            "Extract one key insight from this Q&A that would improve a wiki entry. Return only the insight text, no formatting.",
        },
        {
          role: "user" as const,
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
          "INSERT INTO chat_messages (id, session_id, role, content, context_chunks, context_scores, prompt_tokens, completion_tokens, total_tokens, model, latency_ms, citations, metadata, created_at) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
          msg.citations ?? null,
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
