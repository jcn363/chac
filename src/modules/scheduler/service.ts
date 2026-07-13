import type { Kernel } from "../../kernel/types";
import type { ScheduledTask, TaskStatus } from "./types";
import { createLogger } from "../../utils/logger";

const log = createLogger("scheduler");

/** Background task scheduler for memory consolidation, cleanup, and index checks. */
export class SchedulerService {
  private kernel: Kernel;
  private tasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private running = false;

  constructor(kernel: Kernel) {
    this.kernel = kernel;
  }

  register(name: string, intervalMs: number, fn: () => Promise<void>): void {
    this.tasks.set(name, {
      name,
      intervalMs,
      fn,
      lastRun: 0,
      running: false,
    });
  }

  start(): void {
    if (this.running) return;
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    if (settings.get("scheduler.enabled") === false) return;

    this.running = true;
    for (const [name, task] of this.tasks) {
      this.startTask(name, task);
    }
    log.info(`Scheduler started with ${this.tasks.size} tasks`);
  }

  private startTask(name: string, task: ScheduledTask): void {
    const timer = setInterval(async () => {
      if (task.running) return;
      task.running = true;
      try {
        await task.fn();
        task.lastRun = Date.now();
      } catch (err) {
        log.error(`Scheduler task "${name}" failed`, { error: String(err) });
      } finally {
        task.running = false;
      }
    }, task.intervalMs);
    this.timers.set(name, timer);
  }

  stop(): void {
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    this.running = false;
  }

  async runNow(name: string): Promise<boolean> {
    const task = this.tasks.get(name);
    if (!task || task.running) return false;
    task.running = true;
    try {
      await task.fn();
      task.lastRun = Date.now();
      return true;
    } catch (err) {
      log.error(`Scheduler task "${name}" failed`, { error: String(err) });
      return false;
    } finally {
      task.running = false;
    }
  }

  getStatus(): TaskStatus[] {
    const now = Date.now();
    return Array.from(this.tasks.values()).map((t) => ({
      name: t.name,
      intervalMs: t.intervalMs,
      lastRun: t.lastRun || null,
      running: t.running,
      nextRun: t.lastRun ? t.lastRun + t.intervalMs : now + t.intervalMs,
    }));
  }
}
