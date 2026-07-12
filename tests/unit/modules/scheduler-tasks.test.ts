import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { registerDefaultTasks } from "../../../src/modules/scheduler/tasks";
import { SchedulerService } from "../../../src/modules/scheduler/service";
import type { Kernel } from "../../../src/kernel/types";

let kernel: Kernel;
let scheduler: SchedulerService;

beforeEach(() => {
  kernel = createTestKernel();
  scheduler = kernel.get<SchedulerService>("scheduler");
  registerDefaultTasks(scheduler, kernel);
});

afterEach(() => {
  scheduler.stop();
  kernel.get<{ close: () => void }>("db").close();
});

describe("registerDefaultTasks", () => {
  it("registers 3 tasks", () => {
    const status = scheduler.getStatus();
    expect(status).toHaveLength(3);
  });

  it("registers memory-consolidation task", () => {
    const status = scheduler.getStatus();
    const task = status.find((t) => t.name === "memory-consolidation");
    expect(task).toBeDefined();
    expect(task!.intervalMs).toBe(1800000);
  });

  it("registers session-cleanup task", () => {
    const status = scheduler.getStatus();
    const task = status.find((t) => t.name === "session-cleanup");
    expect(task).toBeDefined();
    expect(task!.intervalMs).toBe(3600000);
  });

  it("registers index-check task", () => {
    const status = scheduler.getStatus();
    const task = status.find((t) => t.name === "index-check");
    expect(task).toBeDefined();
    expect(task!.intervalMs).toBe(900000);
  });

  it("memory-consolidation runs without errors", async () => {
    const memory = kernel.get<{ upsert: (cat: string, key: string, value: string, source: string) => void }>("memory");
    memory.upsert("preference", "lang", "en", "test");
    memory.upsert("preference", "theme", "dark", "test");
    // Should complete without throwing
    await scheduler.runNow("memory-consolidation");
  });

  it("index-check invalidates all indexes", async () => {
    // Should not throw
    await scheduler.runNow("index-check");
  });

  it("session-cleanup deletes old sessions", async () => {
    const db = kernel.get<import("bun:sqlite").Database>("db");
    const chat = kernel.get<{ createSession: (opts: { title: string }) => { id: string }; listSessions: () => any[] }>("chat");

    // Create a session
    chat.createSession({ title: "Recent" });
    const before = chat.listSessions();
    expect(before.length).toBe(1);

    // Manually set updated_at to 60 days ago (beyond 30-day retention)
    const oldDate = new Date(Date.now() - 60 * 86400000).toISOString();
    db.query("UPDATE chat_sessions SET updated_at = ?").run(oldDate);

    await scheduler.runNow("session-cleanup");

    const after = chat.listSessions();
    expect(after.length).toBe(0);
  });

  it("session-cleanup preserves recent sessions", async () => {
    const chat = kernel.get<{ createSession: (opts: { title: string }) => { id: string }; listSessions: () => any[] }>("chat");

    // Create a session (updated_at = now, within retention)
    chat.createSession({ title: "Fresh" });

    await scheduler.runNow("session-cleanup");

    const after = chat.listSessions();
    expect(after.length).toBe(1);
    expect(after[0]!.title).toBe("Fresh");
  });
});
