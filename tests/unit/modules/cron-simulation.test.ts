import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { SchedulerService } from "../../../src/modules/scheduler/service";
import { registerDefaultTasks } from "../../../src/modules/scheduler/tasks";
import { existsSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BACKUP_DIR = join(process.cwd(), "data", "backups");

describe("Cron job simulation", () => {
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

  it("simulates cron job execution for memory-consolidation", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("memory.enabled", true);
    settings.set("memory.max_entries", 100);
    
    const memory = kernel.get<{
      isEnabled: () => boolean;
      list: () => Array<{ id: string; category: string; key: string; value: string }>;
      delete: (id: string) => boolean;
      upsert: (category: string, key: string, value: string) => unknown;
    }>("memory");

    // Insert some test entries
    for (let i = 0; i < 5; i++) {
      memory.upsert("preference", `testKey${i}`, `testValue${i}`);
    }

    const beforeList = memory.list();
    
    // Simulate cron job execution
    const result = await scheduler.runNow("memory-consolidation");
    
    // Verify task executed successfully
    expect(result).toBe(true);
    
    // Verify task completed (list should still work)
    const afterList = memory.list();
    expect(afterList.length).toBe(beforeList.length);
  });

  it("simulates cron job execution for session-cleanup", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("scheduler.session_retention_days", 30);
    
    const db = kernel.get<import("bun:sqlite").Database>("db");
    
    // Insert a test session
    const now = new Date().toISOString();
    db.query("INSERT INTO chat_sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)")
      .run("test-session", "Test Session", now, now);

    const beforeCount = db.query("SELECT COUNT(*) as count FROM chat_sessions").get() as { count: number };
    
    // Simulate cron job execution
    const result = await scheduler.runNow("session-cleanup");
    
    // Verify task executed successfully
    expect(result).toBe(true);
    
    // Verify task completed (recent session should still exist)
    const afterCount = db.query("SELECT COUNT(*) as count FROM chat_sessions").get() as { count: number };
    expect(afterCount.count).toBe(beforeCount.count);
  });

  it("simulates cron job execution for search-history-cleanup", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("scheduler.search_history_retention_days", 30);
    
    const db = kernel.get<import("bun:sqlite").Database>("db");
    
    // Insert a test search history entry
    const now = new Date().toISOString();
    db.query("INSERT INTO search_history (query, created_at) VALUES (?, ?)")
      .run("test query", now);

    const beforeCount = db.query("SELECT COUNT(*) as count FROM search_history").get() as { count: number };
    
    // Simulate cron job execution
    const result = await scheduler.runNow("search-history-cleanup");
    
    // Verify task executed successfully
    expect(result).toBe(true);
    
    // Verify task completed (recent search should still exist)
    const afterCount = db.query("SELECT COUNT(*) as count FROM search_history").get() as { count: number };
    expect(afterCount.count).toBe(beforeCount.count);
  });

  it("simulates cron job execution for auto-backup", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("scheduler.auto_backup_enabled", true);
    settings.set("scheduler.backup_retention", 5);
    
    // Simulate cron job execution
    const result = await scheduler.runNow("auto-backup");
    
    // Verify task executed successfully
    expect(result).toBe(true);
    
    // Verify backup was created
    expect(existsSync(BACKUP_DIR)).toBe(true);
    const files = readdirSync(BACKUP_DIR).filter(f => f.startsWith("backup-") && f.endsWith(".json"));
    expect(files.length).toBe(1);
  });

  it("simulates multiple cron job executions", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("memory.enabled", true);
    settings.set("scheduler.auto_backup_enabled", true);
    
    // Run all tasks multiple times
    for (let i = 0; i < 3; i++) {
      const memoryResult = await scheduler.runNow("memory-consolidation");
      const sessionResult = await scheduler.runNow("session-cleanup");
      const searchResult = await scheduler.runNow("search-history-cleanup");
      const backupResult = await scheduler.runNow("auto-backup");
      
      expect(memoryResult).toBe(true);
      expect(sessionResult).toBe(true);
      expect(searchResult).toBe(true);
      expect(backupResult).toBe(true);
    }
    
    // Verify multiple backups were created
    if (existsSync(BACKUP_DIR)) {
      const files = readdirSync(BACKUP_DIR).filter(f => f.startsWith("backup-") && f.endsWith(".json"));
      expect(files.length).toBe(3);
    }
  });

  it("verifies cron job configuration", () => {
    const status = scheduler.getStatus();
    
    // Verify all cron jobs are registered
    expect(status.length).toBe(4);
    
    // Verify cron job intervals
    const memoryTask = status.find(t => t.name === "memory-consolidation");
    expect(memoryTask?.intervalMs).toBe(1800000); // 30 minutes
    
    const sessionTask = status.find(t => t.name === "session-cleanup");
    expect(sessionTask?.intervalMs).toBe(3600000); // 1 hour
    
    const searchTask = status.find(t => t.name === "search-history-cleanup");
    expect(searchTask?.intervalMs).toBe(86400000); // 24 hours
    
    const backupTask = status.find(t => t.name === "auto-backup");
    expect(backupTask?.intervalMs).toBe(3600000); // 1 hour
  });

  it("verifies cron job error handling", async () => {
    // Create a task that will fail
    scheduler.register("failing-task", 1000, async () => {
      throw new Error("Simulated failure");
    });
    
    // Run the failing task
    const result = await scheduler.runNow("failing-task");
    
    // Task should report failure
    expect(result).toBe(false);
    
    // Scheduler should still be able to run other tasks
    const memoryResult = await scheduler.runNow("memory-consolidation");
    expect(memoryResult).toBe(true);
  });

  it("verifies cron job state management", async () => {
    // Run a task and check state
    const beforeStatus = scheduler.getStatus();
    const memoryTask = beforeStatus.find(t => t.name === "memory-consolidation");
    expect(memoryTask?.lastRun).toBeNull();
    expect(memoryTask?.running).toBe(false);
    
    // Run the task
    await scheduler.runNow("memory-consolidation");
    
    // Check state after execution
    const afterStatus = scheduler.getStatus();
    const memoryTaskAfter = afterStatus.find(t => t.name === "memory-consolidation");
    expect(memoryTaskAfter?.lastRun).toBeGreaterThan(0);
    expect(memoryTaskAfter?.running).toBe(false);
    expect(memoryTaskAfter?.nextRun).toBe(memoryTaskAfter?.lastRun! + memoryTaskAfter?.intervalMs!);
  });
});
