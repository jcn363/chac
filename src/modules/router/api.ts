import { Hono } from "hono";
import type { Kernel } from "../../kernel/types";
import { DocumentsService } from "../documents/service";
import { ChatService } from "../chat/service";
import { WikiService } from "../wiki/service";
import { DEFAULT_SETTINGS } from "../settings/types";

function safeInt(value: string | undefined, fallback: number, max = 100): number {
  if (value === undefined) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

export function setupApiRoutes(app: Hono, kernel: Kernel): void {
  const settings = kernel.get<{ get: (key: string) => unknown; getAll: () => unknown[]; set: (key: string, value: unknown) => void }>("settings");

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
  const docs = new DocumentsService(kernel);

  app.get("/api/documents", (c) => {
    const page = safeInt(c.req.query("page"), 1);
    const perPage = safeInt(c.req.query("per_page"), (settings.get("ui.documents_per_page") as number) ?? 20);
    return c.json(docs.list({ page, perPage }));
  });

  app.get("/api/documents/:id", (c) => {
    const doc = docs.get(c.req.param("id"));
    if (!doc) return c.json({ error: "Not found" }, 404);
    return c.json(doc);
  });

  app.post("/api/documents", async (c) => {
    const body = await c.req.json<{ path: string }>();
    if (!body?.path || typeof body.path !== "string") {
      return c.json({ error: "Missing or invalid path" }, 400);
    }
    const result = await docs.ingest(body.path);
    return c.json(result, 201);
  });

  app.delete("/api/documents/:id", (c) => {
    const deleted = docs.delete(c.req.param("id"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
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

  // Chat
  const chat = new ChatService(kernel);

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
  const wiki = new WikiService(kernel);

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
}
