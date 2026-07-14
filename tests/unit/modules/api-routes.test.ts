import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestKernel } from "../../helpers/setup";
import { createRouter } from "../../../src/modules/router";
import { SettingsService } from "../../../src/modules/settings/service";
import { runMigrations } from "../../../src/database/migrations";
import type { Kernel } from "../../../src/kernel/types";
import { join } from "path";
import { mkdirSync, writeFileSync, rmSync } from "fs";

let db: Database;
let kernel: Kernel;
let app: ReturnType<typeof createRouter>;
const tmpDir = join(import.meta.dir, ".api-test-tmp");

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

async function parseJson<T = any>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
}

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  kernel = createTestKernel();
  kernel.provide("db", db);
  kernel.provide("settings", new SettingsService(db));
  app = createRouter(kernel);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Status ──────────────────────────────────────────────

describe("GET /api/status", () => {
  it("returns ok", async () => {
    const res = await req("/api/status");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe("ok");
  });
});

// ── LLM ─────────────────────────────────────────────────

describe("GET /api/llm/status", () => {
  it("returns llm status", async () => {
    const res = await req("/api/llm/status");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty("chat");
  });
});

// ── Documents ───────────────────────────────────────────

describe("Documents API", () => {
  it("GET /api/documents returns empty list", async () => {
    const res = await req("/api/documents");
    const data = await res.json() as any;
    expect(data.documents).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("GET /api/documents with pagination", async () => {
    const res = await req("/api/documents?page=1&per_page=10");
    const data = await res.json() as any;
    expect(data.page).toBe(1);
    expect(data.perPage).toBe(10);
  });

  it("GET /api/documents/:id returns 404 for unknown", async () => {
    const res = await req("/api/documents/nonexistent");
    expect(res.status).toBe(404);
  });

  it("POST /api/documents ingests a file", async () => {
    const filePath = join(tmpDir, "test-doc.txt");
    writeFileSync(filePath, "Hello world. This is a test document with some content for chunking and embedding.");
    const res = await json("POST", "/api/documents", { path: filePath });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data).toHaveProperty("id");
    expect(data).toHaveProperty("title");
  });

  it("GET /api/documents/:id returns ingested doc", async () => {
    const filePath = join(tmpDir, "find-me.txt");
    writeFileSync(filePath, "Find me content for testing retrieval by id.");
    const createRes = await json("POST", "/api/documents", { path: filePath });
    const { id } = await createRes.json() as any;

    const res = await req(`/api/documents/${id}`);
    expect(res.status).toBe(200);
    const doc = await res.json() as any;
    expect(doc.id).toBe(id);
  });

  it("DELETE /api/documents/:id deletes a doc", async () => {
    const filePath = join(tmpDir, "delete-me.txt");
    writeFileSync(filePath, "Delete this document content for testing.");
    const createRes = await json("POST", "/api/documents", { path: filePath });
    const { id } = await createRes.json() as any;

    const delRes = await req(`/api/documents/${id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);

    const getRes = await req(`/api/documents/${id}`);
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/documents/:id returns 404 for unknown", async () => {
    const res = await req("/api/documents/unknown", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("POST /api/documents/search searches chunks", async () => {
    const filePath = join(tmpDir, "searchable.txt");
    writeFileSync(filePath, "The quick brown fox jumps over the lazy dog. A test for vector search.");
    await json("POST", "/api/documents", { path: filePath });

    const res = await json("POST", "/api/documents/search", { query: "fox" });
    expect(res.status).toBe(200);
    const results = await res.json() as any;
    expect(Array.isArray(results)).toBe(true);
  });

  it("POST /api/documents with missing path returns 400", async () => {
    const res = await json("POST", "/api/documents", {});
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toContain("Missing");
  });

  it("POST /api/documents with url returns error when fetch fails", async () => {
    const res = await json("POST", "/api/documents", { url: "https://example.com/test", description: "Test URL" });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("POST /api/documents/upload with no file returns 400", async () => {
    const res = await req("/api/documents/upload", { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("POST /api/documents/batch with empty array returns 400", async () => {
    const res = await json("POST", "/api/documents/batch", { paths: [] });
    expect(res.status).toBe(400);
  });

  it("POST /api/documents/batch/delete with empty array returns 400", async () => {
    const res = await json("POST", "/api/documents/batch/delete", { ids: [] });
    expect(res.status).toBe(400);
  });

  it("GET /api/documents/status returns status", async () => {
    const res = await req("/api/documents/status");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toHaveProperty("total");
  });

  it("POST /api/documents/search returns 400 for missing query", async () => {
    const res = await json("POST", "/api/documents/search", {});
    expect(res.status).toBe(400);
  });
});

// ── Chat ────────────────────────────────────────────────

describe("Chat API", () => {
  it("GET /api/chat/sessions returns empty list", async () => {
    const res = await req("/api/chat/sessions");
    const data = await res.json() as any;
    expect(data).toEqual([]);
  });

  it("POST /api/chat/sessions creates a session", async () => {
    const res = await json("POST", "/api/chat/sessions", { title: "Test" });
    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data).toHaveProperty("id");
    expect(data.title).toBe("Test");
  });

  it("GET /api/chat/sessions/:id/messages returns messages", async () => {
    const createRes = await json("POST", "/api/chat/sessions", { title: "Msg test" });
    const { id } = await createRes.json() as any;

    const res = await req(`/api/chat/sessions/${id}/messages`);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toEqual([]);
  });

  it("POST /api/chat sends a message", async () => {
    const createRes = await json("POST", "/api/chat/sessions", { title: "Chat" });
    const { id } = await createRes.json() as any;

    const res = await json("POST", "/api/chat", { sessionId: id, message: "Hello" });
    expect(res.status).toBe(200);
    const msg = await res.json() as any;
    expect(msg.role).toBe("assistant");
    expect(msg.content).toContain("Mock response");
  });
});

// ── Wiki ────────────────────────────────────────────────

describe("Wiki API", () => {
  it("GET /api/wiki returns empty list", async () => {
    const res = await req("/api/wiki");
    const data = await res.json() as any;
    expect(data.pages).toEqual([]);
    expect(data.total).toBe(0);
  });

  it("GET /api/wiki with pagination", async () => {
    const res = await req("/api/wiki?page=2&per_page=5");
    const data = await res.json() as any;
    expect(data).toHaveProperty("pages");
  });

  it("GET /api/wiki/:id returns 404 for unknown", async () => {
    const res = await req("/api/wiki/nonexistent");
    expect(res.status).toBe(404);
  });

  it("POST /api/wiki/compile creates pages from documents", async () => {
    const filePath = join(tmpDir, "wiki-source.txt");
    writeFileSync(filePath, "Wiki source content for compilation into structured wiki entries.");
    await json("POST", "/api/documents", { path: filePath });

    const res = await req("/api/wiki/compile", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.compiled).toBeGreaterThan(0);
    expect(data.pages.length).toBeGreaterThan(0);
  });

  it("GET /api/wiki/:id returns compiled page", async () => {
    const filePath = join(tmpDir, "wiki-get.txt");
    writeFileSync(filePath, "Content for wiki page retrieval test.");
    await json("POST", "/api/documents", { path: filePath });
    await req("/api/wiki/compile", { method: "POST" });

    const listRes = await req("/api/wiki");
    const { pages } = await listRes.json() as any;
    expect(pages.length).toBeGreaterThan(0);

    const getRes = await req(`/api/wiki/${pages[0].id}`);
    expect(getRes.status).toBe(200);
    const page = await getRes.json() as any;
    expect(page.id).toBe(pages[0].id);
  });

  it("DELETE /api/wiki/:id deletes a page", async () => {
    const filePath = join(tmpDir, "wiki-del.txt");
    writeFileSync(filePath, "Content for wiki page deletion test.");
    await json("POST", "/api/documents", { path: filePath });
    await req("/api/wiki/compile", { method: "POST" });

    const listRes = await req("/api/wiki");
    const { pages } = await listRes.json() as any;
    const id = pages[0].id;

    const delRes = await req(`/api/wiki/${id}`, { method: "DELETE" });
    expect(delRes.status).toBe(200);

    const getRes = await req(`/api/wiki/${id}`);
    expect(getRes.status).toBe(404);
  });

  it("DELETE /api/wiki/:id returns 404 for unknown", async () => {
    const res = await req("/api/wiki/unknown", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("POST /api/wiki/search searches wiki pages", async () => {
    const filePath = join(tmpDir, "wiki-search.txt");
    writeFileSync(filePath, "Content about machine learning and neural networks for search test.");
    await json("POST", "/api/documents", { path: filePath });
    await req("/api/wiki/compile", { method: "POST" });

    const res = await json("POST", "/api/wiki/search", { query: "machine learning" });
    expect(res.status).toBe(200);
    const results = await res.json() as any;
    expect(Array.isArray(results)).toBe(true);
  });
});

// ── Global Error Handler ─────────────────────────────────

describe("Global error handler", () => {
  it("catches non-AppError and returns 500", async () => {
    const { Hono } = require("hono");
    const { AppError } = require("../../../src/errors") as typeof import("../../../src/errors");
    const testApp = new Hono();

    testApp.onError((err: unknown, c: any) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code }, err.statusCode as any);
      }
      return c.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
    });

    testApp.get("/throw", () => {
      throw new Error("something unexpected");
    });

    const res = await testApp.request("/throw");
    expect(res.status).toBe(500);
    const data = await res.json() as any;
    expect(data.error).toBe("Internal server error");
    expect(data.code).toBe("INTERNAL_ERROR");
  });

  it("passes AppError through with correct status code", async () => {
    const { Hono } = require("hono");
    const { AppError, NotFoundError } = require("../../../src/errors") as typeof import("../../../src/errors");
    const testApp = new Hono();

    testApp.onError((err: unknown, c: any) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code }, err.statusCode as any);
      }
      return c.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
    });

    testApp.get("/not-found", () => {
      throw new NotFoundError("widget", "42");
    });

    const res = await testApp.request("/not-found");
    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.code).toBe("NOT_FOUND");
  });
});
