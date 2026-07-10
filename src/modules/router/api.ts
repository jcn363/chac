import { Hono } from "hono";
import type { Kernel } from "../../kernel/types";
import { DocumentsService } from "../documents/service";
import { ChatService } from "../chat/service";
import { WikiService } from "../wiki/service";
import { DEFAULT_SETTINGS } from "../settings/types";

export function setupApiRoutes(app: Hono, kernel: Kernel): void {
  // Status
  app.get("/api/status", (c) => {
    return c.json({ status: "ok", version: "0.1.0" });
  });

  // Settings
  app.get("/api/settings", (c) => {
    const settings = kernel.get<{ getAll: () => unknown[] }>("settings");
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
      return c.json({ error: `Unknown setting: ${body.key}` }, 400);
    }
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
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
    const page = parseInt(c.req.query("page") ?? "1");
    const perPage = parseInt(c.req.query("per_page") ?? "20");
    return c.json(docs.list({ page, perPage }));
  });

  app.get("/api/documents/:id", (c) => {
    const doc = docs.get(c.req.param("id"));
    if (!doc) return c.json({ error: "Not found" }, 404);
    return c.json(doc);
  });

  app.post("/api/documents", async (c) => {
    const body = await c.req.json<{ path: string }>();
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
    const results = await docs.search(body.query, { limit: body.limit });
    return c.json(results);
  });

  // Chat
  const chat = new ChatService(kernel);

  app.get("/api/chat/sessions", (c) => {
    return c.json(chat.listSessions());
  });

  app.post("/api/chat/sessions", async (c) => {
    const body = await c.req.json<{ title?: string; systemPrompt?: string }>();
    const session = chat.createSession(body);
    return c.json(session, 201);
  });

  app.get("/api/chat/sessions/:id/messages", (c) => {
    return c.json(chat.getMessages(c.req.param("id")));
  });

  app.post("/api/chat", async (c) => {
    const body = await c.req.json<{ sessionId: string; message: string }>();
    const msg = await chat.sendMessage(body.sessionId, body.message);
    return c.json(msg);
  });

  // Wiki
  const wiki = new WikiService(kernel);

  app.get("/api/wiki", (c) => {
    const page = parseInt(c.req.query("page") ?? "1");
    const perPage = parseInt(c.req.query("per_page") ?? "20");
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
    const results = await wiki.search(body.query, { limit: body.limit });
    return c.json(results);
  });
}
