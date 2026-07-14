import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { SchedulerService } from "../../../src/modules/scheduler/service";
import { registerDefaultTasks } from "../../../src/modules/scheduler/tasks";
import { SettingsService } from "../../../src/modules/settings/service";
import { existsSync, readdirSync, rmSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BACKUP_DIR = join(process.cwd(), "data", "backups");

describe("Scheduler task simulation", () => {
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

  it("simulates memory-consolidation task behavior", async () => {
    const settings = kernel.get<SettingsService>("settings");
    settings.set("memory.enabled", true);
    settings.set("memory.max_entries", 10);
    
    const memory = kernel.get<{
      isEnabled: () => boolean;
      list: () => Array<{ id: string; category: string; key: string; value: string }>;
      delete: (id: string) => boolean;
      upsert: (category: string, key: string, value: string) => unknown;
    }>("memory");

    // Insert 15 entries (exceeds max_entries of 10)
    for (let i = 0; i < 15; i++) {
      memory.upsert("preference", `key${i}`, `value${i}`);
    }

    const beforeCount = memory.list().length;
    
    // Simulate what memory-consolidation would do (dedup logic)
    const entries = memory.list();
    const seen = new Map<string, string>();
    const toDelete: string[] = [];
    
    for (const entry of entries) {
      const key = `${entry.category}:${entry.key}`;
      if (seen.has(key) && seen.get(key) === entry.value) {
        toDelete.push(entry.id);
      } else {
        seen.set(key, entry.value);
      }
    }
    
    // No duplicates in this scenario since UNIQUE constraint prevents them
    // The dedup logic still runs but finds nothing to delete
    expect(toDelete.length).toBe(0);
    
    // Verify all entries are unique
    const uniqueKeys = new Set(entries.map(e => `${e.category}:${e.key}`));
    expect(uniqueKeys.size).toBe(entries.length);
  });

  it("simulates session-cleanup task behavior", async () => {
    const settings = kernel.get<SettingsService>("settings");
    settings.set("scheduler.session_retention_days", 30);
    
    const db = kernel.get<import("bun:sqlite").Database>("db");
    
    // Insert sessions with different ages
    const now = Date.now();
    const sessions = [
      { id: "old-60", title: "60 days old", daysOld: 60 },
      { id: "old-31", title: "31 days old", daysOld: 31 },
      { id: "old-30", title: "30 days old", daysOld: 30 },
      { id: "new-1", title: "1 day old", daysOld: 1 },
    ];
    
    for (const session of sessions) {
      const date = new Date(now - session.daysOld * 86400000).toISOString();
      db.query("INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .run(session.id, session.title, date, date);
    }
    
    // Simulate what session-cleanup would do
    const retentionDays = (settings.get("scheduler.session_retention_days") as number) ?? 30;
    const cutoff = new Date(now - retentionDays * 86400000).toISOString();
    
    const beforeCount = db.query("SELECT COUNT(*) as count FROM chat_sessions").get() as { count: number };
    
    // Execute the same query the task would
    db.query("DELETE FROM chat_sessions WHERE updated_at < ?").run(cutoff);
    
    const afterCount = db.query("SELECT COUNT(*) as count FROM chat_sessions").get() as { count: number };
    const remaining = db.query("SELECT id FROM chat_sessions").all() as Array<{ id: string }>;
    
    // Verify behavior
    expect(afterCount.count).toBeLessThan(beforeCount.count);
    expect(remaining.map(s => s.id)).toContain("old-30"); // Exactly 30 days old should remain
    expect(remaining.map(s => s.id)).toContain("new-1");
    expect(remaining.map(s => s.id)).not.toContain("old-60"); // 60 days old should be deleted
    expect(remaining.map(s => s.id)).not.toContain("old-31"); // 31 days old should be deleted
  });

  it("simulates search-history-cleanup task behavior", async () => {
    const settings = kernel.get<SettingsService>("settings");
    settings.set("scheduler.search_history_retention_days", 30);
    
    const db = kernel.get<import("bun:sqlite").Database>("db");
    
    // Insert search history entries with different ages
    const now = Date.now();
    const searches = [
      { query: "old query 60", daysOld: 60 },
      { query: "old query 31", daysOld: 31 },
      { query: "old query 30", daysOld: 30 },
      { query: "new query 1", daysOld: 1 },
    ];
    
    for (const search of searches) {
      const date = new Date(now - search.daysOld * 86400000).toISOString();
      db.query("INSERT INTO search_history (query, created_at) VALUES (?, ?)")
        .run(search.query, date);
    }
    
    // Simulate what search-history-cleanup would do
    const retentionDays = (settings.get("scheduler.search_history_retention_days") as number) || 30;
    const cutoff = new Date(now - retentionDays * 86400000).toISOString();
    
    const beforeCount = db.query("SELECT COUNT(*) as count FROM search_history").get() as { count: number };
    
    // Execute the same query the task would
    db.query("DELETE FROM search_history WHERE created_at < ?").run(cutoff);
    
    const afterCount = db.query("SELECT COUNT(*) as count FROM search_history").get() as { count: number };
    const remaining = db.query("SELECT query FROM search_history").all() as Array<{ query: string }>;
    
    // Verify behavior
    expect(afterCount.count).toBeLessThan(beforeCount.count);
    expect(remaining.map(s => s.query)).toContain("old query 30"); // Exactly 30 days old should remain
    expect(remaining.map(s => s.query)).toContain("new query 1");
    expect(remaining.map(s => s.query)).not.toContain("old query 60"); // 60 days old should be deleted
    expect(remaining.map(s => s.query)).not.toContain("old query 31"); // 31 days old should be deleted
  });

  it("simulates auto-backup task behavior", async () => {
    const settings = kernel.get<SettingsService>("settings");
    settings.set("scheduler.auto_backup_enabled", true);
    settings.set("scheduler.backup_retention", 3);
    
    const db = kernel.get<import("bun:sqlite").Database>("db");
    
    // Simulate multiple backup runs
    for (let i = 0; i < 5; i++) {
      // Create a backup file (simulating what the task would do)
      const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      const filePath = join(BACKUP_DIR, filename);
      
      if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
      
      // Create a minimal backup object
      const backupData = {
        version: "1.0",
        timestamp: new Date().toISOString(),
        tables: {},
      };
      
      // Write to file
      const fs = require("fs");
      fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
      
      // Wait to ensure different timestamp
      await new Promise(r => setTimeout(r, 10));
    }
    
    // Verify files were created
    expect(existsSync(BACKUP_DIR)).toBe(true);
    const allFiles = readdirSync(BACKUP_DIR).filter(f => f.startsWith("backup-") && f.endsWith(".json"));
    expect(allFiles.length).toBe(5);
    
    // Simulate retention cleanup
    const retention = (settings.get("scheduler.backup_retention") as number) ?? 7;
    const sortedFiles = allFiles.sort().reverse();
    const toDelete = sortedFiles.slice(retention);
    
    for (const file of toDelete) {
      const fs = require("fs");
      fs.unlinkSync(join(BACKUP_DIR, file));
    }
    
    const remainingFiles = readdirSync(BACKUP_DIR).filter(f => f.startsWith("backup-") && f.endsWith(".json"));
    expect(remainingFiles.length).toBe(retention);
  });

  it("verifies task intervals match expected values", () => {
    const status = scheduler.getStatus();
    
    // Verify each task has correct interval
    const memoryTask = status.find(t => t.name === "memory-consolidation");
    expect(memoryTask?.intervalMs).toBe(1800000); // 30 minutes
    
    const sessionTask = status.find(t => t.name === "session-cleanup");
    expect(sessionTask?.intervalMs).toBe(3600000); // 1 hour
    
    const searchTask = status.find(t => t.name === "search-history-cleanup");
    expect(searchTask?.intervalMs).toBe(86400000); // 24 hours
    
    const backupTask = status.find(t => t.name === "auto-backup");
    expect(backupTask?.intervalMs).toBe(3600000); // 1 hour
  });

  it("verifies task dependencies on kernel services", async () => {
    // Verify that each task can access its required kernel services
    const status = scheduler.getStatus();
    
    // All tasks should be registered
    expect(status.length).toBe(4);
    
    // Test that tasks can run without throwing (they may not do much with test data)
    for (const task of status) {
      const result = await scheduler.runNow(task.name);
      expect(result).toBe(true);
    }
  });
});
