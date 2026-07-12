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

// ── Memory CRUD ──────────────────────────────────────────

describe("Memory routes", () => {
  it("GET /api/memory returns empty array initially", async () => {
    const res = await req("/api/memory");
    expect(res.status).toBe(200);
    const data = await res.json() as any[];
    expect(Array.isArray(data)).toBe(true);
  });

  it("PUT /api/memory creates an entry", async () => {
    const res = await json("PUT", "/api/memory", {
      category: "preference",
      key: "language",
      value: "English",
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBeDefined();
    expect(data.category).toBe("preference");
    expect(data.key).toBe("language");
    expect(data.value).toBe("English");
  });

  it("PUT /api/memory upserts existing entry", async () => {
    await json("PUT", "/api/memory", {
      category: "preference",
      key: "theme",
      value: "dark",
    });
    const res = await json("PUT", "/api/memory", {
      category: "preference",
      key: "theme",
      value: "light",
    });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.value).toBe("light");

    // Verify only one entry exists
    const listRes = await req("/api/memory");
    const list = await listRes.json() as any[];
    const themes = list.filter((e: any) => e.key === "theme");
    expect(themes.length).toBe(1);
  });

  it("PUT /api/memory returns 400 for missing fields", async () => {
    const res = await json("PUT", "/api/memory", { category: "preference" });
    expect(res.status).toBe(400);
  });

  it("PUT /api/memory returns 400 for invalid category", async () => {
    const res = await json("PUT", "/api/memory", {
      category: "invalid",
      key: "k",
      value: "v",
    });
    expect(res.status).toBe(400);
  });

  it("PUT /api/memory accepts all valid categories", async () => {
    for (const cat of ["preference", "topic", "fact", "summary"]) {
      const res = await json("PUT", "/api/memory", {
        category: cat,
        key: `key_${cat}`,
        value: `value_${cat}`,
      });
      expect(res.status).toBe(200);
    }
  });

  it("DELETE /api/memory/:id deletes an entry", async () => {
    const createRes = await json("PUT", "/api/memory", {
      category: "preference",
      key: "to-delete",
      value: "yes",
    });
    const entry = await createRes.json() as { id: string };

    const res = await req(`/api/memory/${entry.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
  });

  it("DELETE /api/memory/:id returns 404 for unknown", async () => {
    const res = await req("/api/memory/nonexistent", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("entries appear in list after creation", async () => {
    await json("PUT", "/api/memory", {
      category: "fact",
      key: "earth-orbits-sun",
      value: "true",
    });

    const res = await req("/api/memory");
    const data = await res.json() as any[];
    expect(data.length).toBe(1);
    expect(data[0].category).toBe("fact");
    expect(data[0].key).toBe("earth-orbits-sun");
  });

  it("entries disappear from list after deletion", async () => {
    const createRes = await json("PUT", "/api/memory", {
      category: "topic",
      key: "temp",
      value: "temp",
    });
    const entry = await createRes.json() as { id: string };

    await req(`/api/memory/${entry.id}`, { method: "DELETE" });

    const listRes = await req("/api/memory");
    const data = await listRes.json() as any[];
    expect(data.length).toBe(0);
  });
});
