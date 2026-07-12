import { Hono } from "hono";
import type { Kernel } from "../../kernel/types";
import type { DocumentsService } from "../documents/service";
import type { ChatService } from "../chat/service";
import type { WikiService } from "../wiki/service";
import type { MemoryService } from "../memory/service";
import type { SchedulerService } from "../scheduler/service";
import type { ChatSession } from "../chat/types";
import { DEFAULT_SETTINGS } from "../settings/types";
import { exportDatabase, importDatabase } from "../../database";

function safeInt(value: string | undefined, fallback: number, max = 100): number {
  if (value === undefined) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

export function setupApiRoutes(app: Hono, kernel: Kernel): void {
  const settings = kernel.get<{ get: (key: string) => unknown; getAll: () => unknown[]; set: (key: string, value: unknown) => void }>("settings");
  const docs = kernel.get<DocumentsService>("docs");
  const chat = kernel.get<ChatService>("chat");
  const wiki = kernel.get<WikiService>("wiki");
  const memory = kernel.get<MemoryService>("memory");
  const scheduler = kernel.get<SchedulerService>("scheduler");

  // Status
  app.get("/api/status", (c) => {
    return c.json({ status: "ok", version: "0.1.0" });
  });

  // Settings
  app.get("/api/settings", (c) => {
    return c.json(settings.getAll());
  });

  app.put("/api/settings", async (c) => {
    const body = await c.req.json<{ key: string; value: unknown }>();
    if (!body || typeof body.key !== "string" || body.key.length === 0) {
      return c.json({ error: "Missing or invalid key" }, 400);
    }
    if (body.value === undefined) {
      return c.json({ error: "Missing value" }, 400);
    }
    const knownKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    if (!knownKeys.has(body.key)) {
      return c.json({ error: "Unknown setting" }, 400);
    }
    settings.set(body.key, body.value);
    return c.json({ ok: true });
  });

  // LLM Status
  app.get("/api/llm/status", (c) => {
    const llm = kernel.get<{ status: () => unknown }>("llm");
    return c.json(llm.status());
  });

  // Documents
  app.get("/api/documents", (c) => {
    const page = safeInt(c.req.query("page"), 1);
    const perPage = safeInt(c.req.query("per_page"), (settings.get("ui.documents_per_page") as number) ?? 20);
    return c.json(docs.list({ page, perPage }));
  });

  app.get("/api/documents/status", (c) => {
    return c.json(docs.getStatus());
  });

  app.post("/api/documents", async (c) => {
    const body = await c.req.json<{ path: string }>();
    if (!body?.path || typeof body.path !== "string") {
      return c.json({ error: "Missing or invalid path" }, 400);
    }
    const result = await docs.ingest(body.path);
    return c.json(result, 201);
  });

  app.post("/api/documents/batch", async (c) => {
    const body = await c.req.json<{ paths: string[] }>();
    if (!body?.paths || !Array.isArray(body.paths) || body.paths.length === 0) {
      return c.json({ error: "Missing or invalid paths array" }, 400);
    }
    if (body.paths.length > 50) {
      return c.json({ error: "Maximum 50 files per batch" }, 400);
    }
    const result = await docs.batchIngest(body.paths);
    return c.json(result, 201);
  });

  app.post("/api/documents/batch/delete", async (c) => {
    const body = await c.req.json<{ ids: string[] }>();
    if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({ error: "Missing or invalid ids array" }, 400);
    }
    const result = docs.batchDelete(body.ids);
    return c.json(result);
  });

  app.get("/api/documents/:id", (c) => {
    const doc = docs.get(c.req.param("id"));
    if (!doc) return c.json({ error: "Not found" }, 404);
    return c.json(doc);
  });

  app.delete("/api/documents/:id", (c) => {
    const deleted = docs.delete(c.req.param("id"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/api/documents/:id/reingest", async (c) => {
    try {
      const result = await docs.reingest(c.req.param("id"));
      return c.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.startsWith("Document not found")) return c.json({ error: msg }, 404);
      return c.json({ error: msg }, 400);
    }
  });

  app.post("/api/documents/search", async (c) => {
    const body = await c.req.json<{ query: string; limit?: number }>();
    if (!body?.query || typeof body.query !== "string") {
      return c.json({ error: "Missing or invalid query" }, 400);
    }
    const limit = body.limit ? safeInt(String(body.limit), 5) : 5;
    const results = await docs.search(body.query, { limit });
    return c.json(results);
  });

  // Search History
  app.get("/api/search/history", (c) => {
    const limit = safeInt(c.req.query("limit"), 50);
    return c.json(docs.getSearchHistory({ limit }));
  });

  app.delete("/api/search/history", (c) => {
    docs.clearSearchHistory();
    return c.json({ ok: true });
  });

  // Tags
  app.get("/api/tags", (c) => {
    return c.json(docs.listTags());
  });

  app.get("/api/tags/:tag/documents", (c) => {
    const page = safeInt(c.req.query("page"), 1);
    const perPage = safeInt(c.req.query("per_page"), 20);
    return c.json(docs.getDocumentsByTag(c.req.param("tag"), { page, perPage }));
  });

  app.put("/api/documents/:id/tags", async (c) => {
    const body = await c.req.json<{ tags: string[] }>();
    if (!body?.tags || !Array.isArray(body.tags)) {
      return c.json({ error: "Missing or invalid tags array" }, 400);
    }
    try {
      docs.setDocumentTags(c.req.param("id"), body.tags);
      return c.json({ tags: docs.getDocumentTags(c.req.param("id")) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.startsWith("Document not found")) return c.json({ error: msg }, 404);
      return c.json({ error: msg }, 400);
    }
  });

  app.post("/api/documents/:id/tags", async (c) => {
    const body = await c.req.json<{ tags: string[] }>();
    if (!body?.tags || !Array.isArray(body.tags)) {
      return c.json({ error: "Missing or invalid tags array" }, 400);
    }
    try {
      docs.addTags(c.req.param("id"), body.tags);
      return c.json({ tags: docs.getDocumentTags(c.req.param("id")) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.startsWith("Document not found")) return c.json({ error: msg }, 404);
      return c.json({ error: msg }, 400);
    }
  });

  app.delete("/api/documents/:id/tags", async (c) => {
    const body = await c.req.json<{ tags: string[] }>();
    if (!body?.tags || !Array.isArray(body.tags)) {
      return c.json({ error: "Missing or invalid tags array" }, 400);
    }
    docs.removeTags(c.req.param("id"), body.tags);
    return c.json({ tags: docs.getDocumentTags(c.req.param("id")) });
  });

  // Suggested Questions
  app.get("/api/suggest", async (c) => {
    const documentId = c.req.query("documentId") || undefined;
    const count = safeInt(c.req.query("count"), 5, 20);
    const questions = await docs.suggestQuestions(documentId, count);
    return c.json({ questions });
  });

  // Chat
  app.get("/api/chat/sessions", (c) => {
    return c.json(chat.listSessions());
  });

  app.post("/api/chat/sessions", async (c) => {
    const body = await c.req.json<{ title?: string; systemPrompt?: string }>();
    const session = chat.createSession(body ?? {});
    return c.json(session, 201);
  });

  app.get("/api/chat/sessions/:id/messages", (c) => {
    const session = chat.getSession(c.req.param("id"));
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(chat.getMessages(c.req.param("id")));
  });

  app.delete("/api/chat/sessions/:id", (c) => {
    const deleted = chat.deleteSession(c.req.param("id"));
    if (!deleted) return c.json({ error: "Session not found" }, 404);
    return c.json({ ok: true });
  });

  app.put("/api/chat/sessions/:id", async (c) => {
    const body = await c.req.json<{ title: string }>();
    if (!body?.title || typeof body.title !== "string") {
      return c.json({ error: "Missing or invalid title" }, 400);
    }
    const session = chat.updateSession(c.req.param("id"), body.title);
    if (!session) return c.json({ error: "Session not found" }, 404);
    return c.json(session);
  });

  app.put("/api/chat/messages/:id", async (c) => {
    const body = await c.req.json<{ content: string }>();
    if (!body?.content || typeof body.content !== "string") {
      return c.json({ error: "Missing or invalid content" }, 400);
    }
    const msg = chat.updateMessage(c.req.param("id"), body.content);
    if (!msg) return c.json({ error: "Message not found" }, 404);
    return c.json(msg);
  });

  app.delete("/api/chat/messages/:id", (c) => {
    const deleted = chat.deleteMessage(c.req.param("id"));
    if (!deleted) return c.json({ error: "Message not found" }, 404);
    return c.json({ ok: true });
  });

  app.put("/api/chat/sessions", async (c) => {
    const body = await c.req.json<{ ids: string[] }>();
    if (!Array.isArray(body?.ids)) {
      return c.json({ error: "Missing or invalid ids" }, 400);
    }
    chat.reorderSessions(body.ids);
    return c.json({ ok: true });
  });

  app.post("/api/chat", async (c) => {
    const body = await c.req.json<{ sessionId: string; message: string }>();
    if (!body?.sessionId || typeof body.sessionId !== "string") {
      return c.json({ error: "Missing or invalid sessionId" }, 400);
    }
    if (!body.message || typeof body.message !== "string") {
      return c.json({ error: "Missing or invalid message" }, 400);
    }
    const msg = await chat.sendMessage(body.sessionId, body.message);
    return c.json(msg);
  });

  // Wiki
  app.get("/api/wiki", (c) => {
    const page = safeInt(c.req.query("page"), 1);
    const perPage = safeInt(c.req.query("per_page"), (settings.get("ui.documents_per_page") as number) ?? 20);
    return c.json(wiki.list({ page, perPage }));
  });

  app.get("/api/wiki/:id", (c) => {
    const page = wiki.get(c.req.param("id"));
    if (!page) return c.json({ error: "Not found" }, 404);
    return c.json(page);
  });

  app.post("/api/wiki/compile", async (c) => {
    const pages = await wiki.compile();
    return c.json({ compiled: pages.length, pages });
  });

  app.delete("/api/wiki/:id", (c) => {
    const deleted = wiki.delete(c.req.param("id"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/api/wiki/search", async (c) => {
    const body = await c.req.json<{ query: string; limit?: number }>();
    if (!body?.query || typeof body.query !== "string") {
      return c.json({ error: "Missing or invalid query" }, 400);
    }
    const limit = body.limit ? safeInt(String(body.limit), 5) : 5;
    const results = await wiki.search(body.query, { limit });
    return c.json(results);
  });

  // Memory
  app.get("/api/memory", (c) => {
    return c.json(memory.list());
  });

  app.put("/api/memory", async (c) => {
    const body = await c.req.json<{ category: string; key: string; value: string }>();
    if (!body?.category || !body?.key || !body?.value) {
      return c.json({ error: "Missing required fields: category, key, value" }, 400);
    }
    const validCategories = ["preference", "topic", "fact", "summary"];
    if (!validCategories.includes(body.category)) {
      return c.json({ error: "Invalid category" }, 400);
    }
    const entry = memory.upsert(body.category as "preference" | "topic" | "fact" | "summary", body.key, body.value, "manual");
    return c.json(entry);
  });

  app.delete("/api/memory/:id", (c) => {
    const deleted = memory.delete(c.req.param("id"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  // Conversation Export/Import
  app.get("/api/chat/sessions/:id/export", (c) => {
    const data = chat.exportSession(c.req.param("id"));
    if (!data) return c.json({ error: "Session not found" }, 404);
    return c.json(data);
  });

  app.post("/api/chat/import", async (c) => {
    const body = await c.req.json<{ session: Record<string, unknown>; messages: Array<Record<string, unknown>> }>();
    if (!body?.messages || !Array.isArray(body.messages)) {
      return c.json({ error: "Missing or invalid messages array" }, 400);
    }
    const validRoles = ["user", "assistant", "system", "tool"];
    const messages = body.messages.map((m) => ({
      role: (validRoles.includes(m.role as string) ? m.role : "user") as "user" | "assistant" | "system" | "tool",
      content: (m.content as string) ?? "",
      context_chunks: m.context_chunks as string | null,
      context_scores: m.context_scores as string | null,
      prompt_tokens: m.prompt_tokens as number | null,
      completion_tokens: m.completion_tokens as number | null,
      total_tokens: m.total_tokens as number | null,
      model: m.model as string | null,
      latency_ms: m.latency_ms as number | null,
      metadata: m.metadata as string | null,
      created_at: m.created_at as string | undefined,
    }));
    const session = chat.importSession({
      session: body.session as Partial<ChatSession>,
      messages,
    });
    return c.json(session, 201);
  });

  // Cache
  app.get("/api/cache/stats", (c) => {
    return c.json(docs.getCacheStats());
  });

  app.post("/api/cache/clear", (c) => {
    docs.clearCache();
    return c.json({ ok: true });
  });

  // Scheduler
  app.get("/api/scheduler/status", (c) => {
    return c.json(scheduler.getStatus());
  });

  app.post("/api/scheduler/run/:name", async (c) => {
    const name = c.req.param("name");
    const success = await scheduler.runNow(name);
    if (!success) return c.json({ error: "Task not found or already running" }, 400);
    return c.json({ ok: true });
  });

  // Backup/Restore
  app.get("/api/backup", (c) => {
    const data = exportDatabase();
    return c.json(data);
  });

  app.post("/api/restore", async (c) => {
    const body = await c.req.json<{ tables: Record<string, unknown[][]>; version?: string; timestamp?: string }>();
    if (!body?.tables || typeof body.tables !== "object") {
      return c.json({ error: "Missing or invalid backup data" }, 400);
    }
    try {
      importDatabase({ version: body.version ?? "1.0.0", timestamp: body.timestamp ?? new Date().toISOString(), tables: body.tables });
      chat.invalidateIndexes();
      return c.json({ ok: true, message: "Database restored successfully" });
    } catch (err) {
      return c.json({ error: `Restore failed: ${err instanceof Error ? err.message : "Unknown error"}` }, 500);
    }
  });
}
