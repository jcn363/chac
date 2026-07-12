import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestKernel } from "../../helpers/setup";
import { createRouter } from "../../../src/modules/router";
import type { Kernel } from "../../../src/kernel/types";

let db: Database;
let kernel: Kernel;
let app: ReturnType<typeof createRouter>;

function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

function json(method: string, path: string, body: unknown) {
  return req(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const { runMigrations } = require("../../../src/database/migrations");
  runMigrations(db);
  kernel = createTestKernel();
  app = createRouter(kernel);
});

afterEach(() => {
  db.close();
});

// ── Chat Export/Import ───────────────────────────────────

describe("Chat Export/Import routes", () => {
  it("GET /api/chat/sessions/:id/export exports a session", async () => {
    // Create a session with a message
    const createRes = await json("POST", "/api/chat/sessions", { title: "Export Test" });
    const session = await createRes.json() as { id: string };

    await json("POST", "/api/chat", {
      sessionId: session.id,
      message: "Hello, export me!",
    });

    const res = await req(`/api/chat/sessions/${session.id}/export`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.session).toBeDefined();
    expect(data.messages).toBeDefined();
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.messages.length).toBeGreaterThan(0);
  });

  it("GET /api/chat/sessions/:id/export returns 404 for unknown session", async () => {
    const res = await req("/api/chat/sessions/nonexistent/export");
    expect(res.status).toBe(404);
  });

  it("POST /api/chat/import imports a conversation", async () => {
    const importData = {
      session: { title: "Imported Session" },
      messages: [
        { role: "user", content: "Imported question" },
        { role: "assistant", content: "Imported answer" },
      ],
    };

    const res = await json("POST", "/api/chat/import", importData);
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
    expect(data.title).toBe("Imported Session");

    // Verify messages were imported
    const msgRes = await req(`/api/chat/sessions/${data.id}/messages`);
    const messages = await msgRes.json() as any[];
    expect(messages.length).toBe(2);
  });

  it("POST /api/chat/import returns 400 for missing messages", async () => {
    const res = await json("POST", "/api/chat/import", { session: {} });
    expect(res.status).toBe(400);
  });

  it("POST /api/chat/import handles invalid roles gracefully", async () => {
    const importData = {
      session: { title: "Role Test" },
      messages: [
        { role: "invalid_role", content: "Should default to user" },
        { role: "assistant", content: "Normal response" },
      ],
    };

    const res = await json("POST", "/api/chat/import", importData);
    expect(res.status).toBe(201);
    const data = await res.json() as any;

    const msgRes = await req(`/api/chat/sessions/${data.id}/messages`);
    const messages = await msgRes.json() as any[];
    expect(messages[0].role).toBe("user"); // invalid role defaults to user
    expect(messages[1].role).toBe("assistant");
  });
});

// ── Chat CRUD (additional coverage) ──────────────────────

describe("Chat CRUD routes", () => {
  it("POST /api/chat/sessions creates a session", async () => {
    const res = await json("POST", "/api/chat/sessions", { title: "New Session" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
    expect(data.title).toBe("New Session");
  });

  it("POST /api/chat creates session when no title given", async () => {
    const res = await json("POST", "/api/chat/sessions", {});
    expect(res.status).toBe(201);
  });

  it("GET /api/chat/sessions lists sessions", async () => {
    await json("POST", "/api/chat/sessions", { title: "S1" });
    await json("POST", "/api/chat/sessions", { title: "S2" });
    const res = await req("/api/chat/sessions");
    expect(res.status).toBe(200);
    const data = await res.json() as any[];
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it("PUT /api/chat/sessions/:id updates title", async () => {
    const createRes = await json("POST", "/api/chat/sessions", { title: "Old" });
    const session = await createRes.json() as { id: string };

    const res = await json("PUT", `/api/chat/sessions/${session.id}`, { title: "New" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.title).toBe("New");
  });

  it("PUT /api/chat/sessions/:id returns 400 for invalid title", async () => {
    const createRes = await json("POST", "/api/chat/sessions", { title: "Test" });
    const session = await createRes.json() as { id: string };

    const res = await json("PUT", `/api/chat/sessions/${session.id}`, { title: "" });
    expect(res.status).toBe(400);
  });

  it("PUT /api/chat/sessions/:id returns 404 for unknown", async () => {
    const res = await json("PUT", "/api/chat/sessions/unknown", { title: "X" });
    expect(res.status).toBe(404);
  });

  it("DELETE /api/chat/sessions/:id deletes session", async () => {
    const createRes = await json("POST", "/api/chat/sessions", { title: "Del" });
    const session = await createRes.json() as { id: string };

    const res = await req(`/api/chat/sessions/${session.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  it("DELETE /api/chat/sessions/:id returns 404 for unknown", async () => {
    const res = await req("/api/chat/sessions/unknown", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("PUT /api/chat/sessions reorders sessions", async () => {
    const s1 = await (await json("POST", "/api/chat/sessions", { title: "A" })).json() as { id: string };
    const s2 = await (await json("POST", "/api/chat/sessions", { title: "B" })).json() as { id: string };

    const res = await json("PUT", "/api/chat/sessions", { ids: [s2.id, s1.id] });
    expect(res.status).toBe(200);
  });

  it("PUT /api/chat/sessions returns 400 for invalid ids", async () => {
    const res = await json("PUT", "/api/chat/sessions", { ids: "not-array" });
    expect(res.status).toBe(400);
  });

  it("GET /api/chat/sessions/:id/messages returns messages", async () => {
    const createRes = await json("POST", "/api/chat/sessions", { title: "Msg" });
    const session = await createRes.json() as { id: string };
    await json("POST", "/api/chat", { sessionId: session.id, message: "Hi" });

    const res = await req(`/api/chat/sessions/${session.id}/messages`);
    expect(res.status).toBe(200);
    const data = await res.json() as any[];
    expect(data.length).toBeGreaterThan(0);
  });

  it("GET /api/chat/sessions/:id/messages returns 404 for unknown", async () => {
    const res = await req("/api/chat/sessions/unknown/messages");
    expect(res.status).toBe(404);
  });

  it("PUT /api/chat/messages/:id edits a message", async () => {
    const createRes = await json("POST", "/api/chat/sessions", { title: "Edit" });
    const session = await createRes.json() as { id: string };
    const msgRes = await json("POST", "/api/chat", { sessionId: session.id, message: "Original" });
    const msg = await msgRes.json() as { id: string };

    const res = await json("PUT", `/api/chat/messages/${msg.id}`, { content: "Edited" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.content).toBe("Edited");
  });

  it("PUT /api/chat/messages/:id returns 400 for invalid content", async () => {
    const createRes = await json("POST", "/api/chat/sessions", { title: "X" });
    const session = await createRes.json() as { id: string };
    const msgRes = await json("POST", "/api/chat", { sessionId: session.id, message: "Hi" });
    const msg = await msgRes.json() as { id: string };

    const res = await json("PUT", `/api/chat/messages/${msg.id}`, { content: "" });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/chat/messages/:id deletes a message", async () => {
    const createRes = await json("POST", "/api/chat/sessions", { title: "Del" });
    const session = await createRes.json() as { id: string };
    const msgRes = await json("POST", "/api/chat", { sessionId: session.id, message: "Delete me" });
    const msg = await msgRes.json() as { id: string };

    const res = await req(`/api/chat/messages/${msg.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  it("DELETE /api/chat/messages/:id returns 404 for unknown", async () => {
    const res = await req("/api/chat/messages/unknown", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
