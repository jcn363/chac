import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { ChatService } from "../../chat/service";
import type { ChatSession } from "../../chat/types";
import { wrap } from "../utils";

export function setupChatRoutes(app: Hono, kernel: Kernel): void {
  const chat = kernel.get<ChatService>("chat");

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

  app.post("/api/chat", wrap(async (c) => {
    const body = await c.req.json<{ sessionId: string; message: string }>();
    if (!body?.sessionId || typeof body.sessionId !== "string") {
      return c.json({ error: "Missing or invalid sessionId" }, 400);
    }
    if (!body.message || typeof body.message !== "string") {
      return c.json({ error: "Missing or invalid message" }, 400);
    }
    const msg = await chat.sendMessage(body.sessionId, body.message);
    return c.json(msg);
  }));

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
}
