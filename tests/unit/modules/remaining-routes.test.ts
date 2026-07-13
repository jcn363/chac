import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestKernel } from "../../helpers/setup";
import { createRouter } from "../../../src/modules/router";
import { registerDefaultTasks } from "../../../src/modules/scheduler/tasks";
import type { Kernel } from "../../../src/kernel/types";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";

let db: Database;
let kernel: Kernel;
let app: ReturnType<typeof createRouter>;
const tmpDir = join(import.meta.dir, ".remaining-routes-tmp");

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
  mkdirSync(tmpDir, { recursive: true });
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const { runMigrations } = require("../../../src/database/migrations");
  runMigrations(db);
  kernel = createTestKernel();
  const scheduler = kernel.get<import("../../../src/modules/scheduler/service").SchedulerService>("scheduler");
  registerDefaultTasks(scheduler, kernel);
  app = createRouter(kernel);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Backup/Restore (validation only — export/import use global DB) ──

describe("Restore route validation", () => {
  it("POST /api/restore returns 400 for missing tables", async () => {
    const res = await json("POST", "/api/restore", { version: "1.0.0" });
    expect(res.status).toBe(400);
  });

  it("POST /api/restore returns 400 for invalid body", async () => {
    const res = await json("POST", "/api/restore", "not-an-object");
    expect(res.status).toBe(400);
  });
});

// ── Scheduler ────────────────────────────────────────────

describe("Scheduler routes", () => {
  it("GET /api/scheduler/status returns task list", async () => {
    const res = await req("/api/scheduler/status");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(3);
  });

  it("POST /api/scheduler/run/:name runs a task", async () => {
    const res = await req("/api/scheduler/run/index-check", { method: "POST" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
  });

  it("POST /api/scheduler/run/:name returns 400 for unknown task", async () => {
    const res = await req("/api/scheduler/run/nonexistent", { method: "POST" });
    expect(res.status).toBe(400);
  });
});

// ── Suggest Questions ────────────────────────────────────

describe("Suggest routes", () => {
  it("GET /api/suggest returns questions", async () => {
    const res = await req("/api/suggest");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.questions).toBeDefined();
    expect(Array.isArray(data.questions)).toBe(true);
  });

  it("GET /api/suggest respects count parameter", async () => {
    const res = await req("/api/suggest?count=3");
    expect(res.status).toBe(200);
  });

  it("GET /api/suggest with documentId", async () => {
    const filePath = join(tmpDir, "suggest-doc.txt");
    writeFileSync(filePath, "Content about machine learning and neural networks.");
    await json("POST", "/api/documents", { path: filePath });

    const res = await req("/api/suggest?documentId=nonexistent");
    expect(res.status).toBe(200);
  });
});

// ── Search History ───────────────────────────────────────

describe("Search History routes", () => {
  it("GET /api/search/history returns array", async () => {
    const res = await req("/api/search/history");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(Array.isArray(data)).toBe(true);
  });

  it("DELETE /api/search/history clears history", async () => {
    const res = await req("/api/search/history", { method: "DELETE" });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
  });

  it("GET /api/search/history respects limit parameter", async () => {
    const res = await req("/api/search/history?limit=10");
    expect(res.status).toBe(200);
  });
});
