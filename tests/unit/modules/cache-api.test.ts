import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestKernel } from "../../helpers/setup";
import { createRouter } from "../../../src/modules/router";
import { runMigrations } from "../../../src/database/migrations";
import { embeddingCache } from "../../../src/utils/cache";
import type { Kernel } from "../../../src/kernel/types";

let db: Database;
let kernel: Kernel;
let app: ReturnType<typeof createRouter>;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);

  kernel = createTestKernel();
  kernel.provide("db", db);

  const settingsMod = require("../../../src/modules/settings/service");
  kernel.provide("settings", new settingsMod.SettingsService(db));

  app = createRouter(kernel);
  embeddingCache.clear();
  embeddingCache.resetStats();
});

afterEach(() => {
  db.close();
});

describe("GET /api/cache/stats", () => {
  it("returns cache statistics", async () => {
    const res = await app.request("/api/cache/stats");
    expect(res.status).toBe(200);
    const data = await res.json() as { embedding: Record<string, number>; search: Record<string, number> };
    expect(data).toHaveProperty("embedding");
    expect(data).toHaveProperty("search");
    expect(typeof data.embedding.hits).toBe("number");
    expect(typeof data.search.hits).toBe("number");
    expect(typeof data.embedding.hitRate).toBe("number");
    expect(typeof data.search.hitRate).toBe("number");
  });
});

describe("POST /api/cache/clear", () => {
  it("clears all caches", async () => {
    embeddingCache.set("test", new Float32Array(10));

    const res = await app.request("/api/cache/clear", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json() as { ok: boolean };
    expect(data.ok).toBe(true);

    expect(embeddingCache.size).toBe(0);
  });

  it("is idempotent (clearing empty cache succeeds)", async () => {
    const res = await app.request("/api/cache/clear", { method: "POST" });
    expect(res.status).toBe(200);
  });
});
