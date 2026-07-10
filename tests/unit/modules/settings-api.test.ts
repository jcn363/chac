import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Database } from "bun:sqlite";
import { SettingsService } from "../../../src/modules/settings/service";
import { createTestKernel } from "../../helpers/setup";
import { createRouter } from "../../../src/modules/router";
import { runMigrations } from "../../../src/database/migrations";
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
  kernel.provide("settings", new SettingsService(db));

  app = createRouter(kernel);
});

afterEach(() => {
  db.close();
});

const PUT = (body: unknown) =>
  app.request("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PUT /api/settings validation", () => {
  it("rejects missing key", async () => {
    const res = await PUT({ value: "x" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/key/i);
  });

  it("rejects empty string key", async () => {
    const res = await PUT({ key: "", value: "x" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/key/i);
  });

  it("rejects non-string key", async () => {
    const res = await PUT({ key: 123, value: "x" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/key/i);
  });

  it("rejects missing value", async () => {
    const res = await PUT({ key: "llm.chat.model" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/value/i);
  });

  it("rejects unknown setting key", async () => {
    const res = await PUT({ key: "hacker.thing", value: "x" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Unknown setting/i);
  });

  it("accepts valid known key with value", async () => {
    const res = await PUT({ key: "llm.chat.model", value: "phi3" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("persists accepted value", async () => {
    await PUT({ key: "llm.chat.temperature", value: 0.95 });
    const res = await app.request("/api/settings");
    const data = await res.json();
    const setting = data.find((s: { key: string }) => s.key === "llm.chat.temperature");
    expect(JSON.parse(setting.value)).toBe(0.95);
  });

  it("accepts boolean values", async () => {
    const res = await PUT({ key: "ui.dark_mode", value: true });
    expect(res.status).toBe(200);
  });

  it("accepts null as a value", async () => {
    const res = await PUT({ key: "rag.max_chunks", value: null });
    expect(res.status).toBe(200);
  });
});
