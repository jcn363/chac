import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../helpers/setup";
import { SchedulerService } from "../../src/modules/scheduler/service";
import type { Kernel } from "../../src/kernel/types";

describe("SchedulerService", () => {
  let kernel: Kernel;
  let scheduler: SchedulerService;

  beforeEach(() => {
    kernel = createTestKernel();
    scheduler = new SchedulerService(kernel);
  });

  afterEach(() => {
    scheduler.stop();
  });

  it("registers and lists tasks", () => {
    scheduler.register("test-task", 1000, async () => {});
    const status = scheduler.getStatus();
    expect(status.length).toBe(1);
    expect(status[0]!.name).toBe("test-task");
    expect(status[0]!.intervalMs).toBe(1000);
    expect(status[0]!.running).toBe(false);
    expect(status[0]!.lastRun).toBeNull();
  });

  it("registers multiple tasks", () => {
    scheduler.register("task-a", 1000, async () => {});
    scheduler.register("task-b", 2000, async () => {});
    scheduler.register("task-c", 3000, async () => {});
    expect(scheduler.getStatus().length).toBe(3);
  });

  it("runNow executes task", async () => {
    let executed = false;
    scheduler.register("test-task", 1000, async () => {
      executed = true;
    });
    const result = await scheduler.runNow("test-task");
    expect(result).toBe(true);
    expect(executed).toBe(true);
  });

  it("runNow returns false for unknown task", async () => {
    const result = await scheduler.runNow("nonexistent");
    expect(result).toBe(false);
  });

  it("runNow updates lastRun", async () => {
    scheduler.register("test-task", 1000, async () => {});
    await scheduler.runNow("test-task");
    const status = scheduler.getStatus();
    expect(status[0]!.lastRun).toBeGreaterThan(0);
  });

  it("start and stop lifecycle", () => {
    scheduler.register("test-task", 1000, async () => {});
    scheduler.start();
    scheduler.stop();
    expect(scheduler.getStatus().length).toBe(1);
  });

  it("start is idempotent", () => {
    scheduler.register("test-task", 1000, async () => {});
    scheduler.start();
    scheduler.start();
    scheduler.stop();
  });

  it("stop is idempotent", () => {
    scheduler.register("test-task", 1000, async () => {});
    scheduler.start();
    scheduler.stop();
    scheduler.stop();
  });

  it("task execution tracks running state", async () => {
    let resolvePromise: () => void;
    const blockPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    scheduler.register("slow-task", 1000, async () => {
      await blockPromise;
    });

    const runPromise = scheduler.runNow("slow-task");
    const status = scheduler.getStatus();
    expect(status[0]!.running).toBe(true);

    resolvePromise!();
    await runPromise;
    const statusAfter = scheduler.getStatus();
    expect(statusAfter[0]!.running).toBe(false);
  });

  it("runNow returns false if task already running", async () => {
    let resolvePromise: () => void;
    const blockPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    scheduler.register("slow-task", 1000, async () => {
      await blockPromise;
    });

    const runPromise = scheduler.runNow("slow-task");
    const secondRun = await scheduler.runNow("slow-task");
    expect(secondRun).toBe(false);

    resolvePromise!();
    await runPromise;
  });

  it("start launches tasks on interval", async () => {
    let count = 0;
    scheduler.register("tick-task", 50, async () => {
      count++;
    });
    scheduler.start();

    // Wait for at least 2 interval ticks
    await new Promise((r) => setTimeout(r, 150));
    scheduler.stop();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("task failure in timer does not crash scheduler", async () => {
    let count = 0;
    scheduler.register("fail-task", 50, async () => {
      count++;
      if (count === 1) throw new Error("boom");
    });
    scheduler.start();

    await new Promise((r) => setTimeout(r, 200));
    scheduler.stop();
    // Task should have continued running after the error
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("start skips when scheduler.enabled is false", () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("scheduler.enabled", false);

    let count = 0;
    scheduler.register("disabled-task", 50, async () => { count++; });
    scheduler.start();

    // Timer should not have started — count should stay 0
    expect(count).toBe(0);
    scheduler.stop();
  });

  it("getStatus shows nextRun calculated from lastRun", async () => {
    scheduler.register("calculated", 1000, async () => {});
    await scheduler.runNow("calculated");
    const status = scheduler.getStatus();
    expect(status[0]!.lastRun).toBeGreaterThan(0);
    expect(status[0]!.nextRun).toBe(status[0]!.lastRun! + 1000);
  });

  it("getStatus shows nextRun as now+interval when never run", () => {
    scheduler.register("never-run", 2000, async () => {});
    const before = Date.now();
    const status = scheduler.getStatus();
    expect(status[0]!.lastRun).toBeNull();
    expect(status[0]!.nextRun).toBeGreaterThanOrEqual(before + 2000);
  });
});
