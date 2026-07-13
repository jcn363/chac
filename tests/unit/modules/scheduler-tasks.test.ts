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
    expect(names).toContain("index-check");
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
});
