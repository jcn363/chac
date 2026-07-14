import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { registerDefaultTasks } from "../../../src/modules/scheduler/tasks";
import { SchedulerService } from "../../../src/modules/scheduler/service";
import { SettingsService } from "../../../src/modules/settings/service";
import { existsSync, readdirSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BACKUP_DIR = join(process.cwd(), "data", "backups");

describe("Scheduler default tasks", () => {
  let kernel: ReturnType<typeof createTestKernel>;
  let scheduler: SchedulerService;

  beforeEach(() => {
    kernel = createTestKernel();
    scheduler = new SchedulerService(kernel);
    registerDefaultTasks(scheduler, kernel);
    // Clean backup dir before each test
    if (existsSync(BACKUP_DIR)) {
      const files = readdirSync(BACKUP_DIR);
      for (const f of files) rmSync(join(BACKUP_DIR, f));
    }
  });

  afterEach(() => {
    scheduler.stop();
    // Clean backup dir after each test
    if (existsSync(BACKUP_DIR)) {
      const files = readdirSync(BACKUP_DIR);
      for (const f of files) rmSync(join(BACKUP_DIR, f));
      rmSync(BACKUP_DIR, { recursive: true });
    }
  });

  it("registers auto-backup task", () => {
    const status = scheduler.getStatus();
    const task = status.find((t) => t.name === "auto-backup");
    expect(task).toBeDefined();
    expect(task!.intervalMs).toBe(3600000);
  });

  it("registers all four default tasks", () => {
    const names = scheduler.getStatus().map((t) => t.name);
    expect(names).toContain("memory-consolidation");
    expect(names).toContain("session-cleanup");
    expect(names).toContain("search-history-cleanup");
    expect(names).toContain("auto-backup");
  });

  it("auto-backup creates a JSON backup file", async () => {
    const result = await scheduler.runNow("auto-backup");
    expect(result).toBe(true);

    expect(existsSync(BACKUP_DIR)).toBe(true);
    const files = readdirSync(BACKUP_DIR).filter((f) => f.startsWith("backup-") && f.endsWith(".json"));
    expect(files.length).toBe(1);

    const content = JSON.parse(readFileSync(join(BACKUP_DIR, files[0]!), "utf-8"));
    expect(content).toHaveProperty("version");
    expect(content).toHaveProperty("timestamp");
    expect(content).toHaveProperty("tables");
  });

  it("auto-backup respects enabled setting", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("scheduler.auto_backup_enabled", false);

    await scheduler.runNow("auto-backup");

    // No backup dir should be created when disabled
    if (existsSync(BACKUP_DIR)) {
      const files = readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json"));
      expect(files.length).toBe(0);
    }
  });

  it("auto-backup creates multiple backups with unique names", async () => {
    await scheduler.runNow("auto-backup");
    // Wait 10ms to ensure different timestamp in filename
    await new Promise((r) => setTimeout(r, 10));
    await scheduler.runNow("auto-backup");

    const files = readdirSync(BACKUP_DIR).filter((f) => f.startsWith("backup-") && f.endsWith(".json"));
    expect(files.length).toBe(2);
  });

  it("auto-backup cleans up old backups beyond retention", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("scheduler.backup_retention", 2);

    // Create 3 backups sequentially (different filenames via timestamps)
    for (let i = 0; i < 3; i++) {
      await scheduler.runNow("auto-backup");
      await new Promise((r) => setTimeout(r, 10));
    }

    const files = readdirSync(BACKUP_DIR).filter((f) => f.startsWith("backup-") && f.endsWith(".json"));
    expect(files.length).toBe(2);
  });

  it("memory-consolidation processes entries when enabled", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("memory.enabled", true);
    const memory = kernel.get<{ upsert: (cat: string, key: string, val: string) => unknown; list: () => Array<{ id: string; category: string; key: string; value: string }> }>("memory");

    // Insert entries — dedup logic iterates and checks for duplicates
    memory.upsert("preference", "theme", "dark");
    memory.upsert("preference", "lang", "en");

    const before = memory.list();
    expect(before.length).toBe(2);

    // Run consolidation — no duplicates, so entries remain
    await scheduler.runNow("memory-consolidation");

    const after = memory.list();
    expect(after.length).toBe(2);
  });

  it("memory-consolidation dedup removes entries with same category:key:value when duplicates exist", async () => {
    // This tests the dedup logic by creating duplicates via a mock that bypasses UNIQUE constraint.
    // Since user_memory has UNIQUE(category,key), we use a mock memory service.
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("memory.enabled", true);

    const entries: Array<{ id: string; category: string; key: string; value: string }> = [
      { id: "m1", category: "preference", key: "theme", value: "dark" },
      { id: "m2", category: "preference", key: "theme", value: "dark" }, // duplicate
      { id: "m3", category: "preference", key: "lang", value: "en" },
    ];
    const deleted: string[] = [];

    // Replace memory service with mock
    kernel.provide("memory", {
      isEnabled: () => true,
      list: () => entries,
      delete: (id: string) => { deleted.push(id); return true; },
    } as never);

    // Re-register tasks with the new mock
    scheduler.stop();
    scheduler = new SchedulerService(kernel);
    registerDefaultTasks(scheduler, kernel);

    await scheduler.runNow("memory-consolidation");

    // m2 should be deleted (same category:key:value as m1)
    expect(deleted).toContain("m2");
    expect(deleted).not.toContain("m1");
    expect(deleted).not.toContain("m3");
  });

  it("memory-consolidation skips when memory is disabled", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("memory.enabled", false);

    // Should not throw
    const result = await scheduler.runNow("memory-consolidation");
    expect(result).toBe(true);
  });

  it("session-cleanup removes old sessions beyond retention", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("scheduler.session_retention_days", 30);
    const db = kernel.get<import("bun:sqlite").Database>("db");

    // Insert a session with updated_at 60 days ago
    const oldDate = new Date(Date.now() - 60 * 86400000).toISOString();
    db.query("INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)").run("old-session", "Old", oldDate, oldDate);

    // Insert a recent session
    const newDate = new Date().toISOString();
    db.query("INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)").run("new-session", "New", newDate, newDate);

    await scheduler.runNow("session-cleanup");

    const remaining = db.query("SELECT id FROM chat_sessions").all() as Array<{ id: string }>;
    expect(remaining.map((s) => s.id)).toContain("new-session");
    expect(remaining.map((s) => s.id)).not.toContain("old-session");
  });

  it("session-cleanup uses default 30-day retention when setting not configured", async () => {
    const db = kernel.get<import("bun:sqlite").Database>("db");

    // Insert a session with updated_at 31 days ago (should be deleted with default 30 days)
    const oldDate = new Date(Date.now() - 31 * 86400000).toISOString();
    db.query("INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)").run("old-default", "Old", oldDate, oldDate);

    await scheduler.runNow("session-cleanup");

    const remaining = db.query("SELECT id FROM chat_sessions").all() as Array<{ id: string }>;
    expect(remaining.map((s) => s.id)).not.toContain("old-default");
  });
});
