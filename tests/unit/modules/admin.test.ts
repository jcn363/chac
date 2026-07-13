import { describe, it, expect, beforeEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { createRouter, rateLimitState } from "../../../src/modules/router";
import { registerDefaultTasks } from "../../../src/modules/scheduler/tasks";
import type { Kernel } from "../../../src/kernel/types";

let kernel: Kernel;
let app: ReturnType<typeof createRouter>;

function req(path: string) {
  return app.request(path);
}

beforeEach(() => {
  rateLimitState.reset();
  kernel = createTestKernel();
  const scheduler = kernel.get<import("../../../src/modules/scheduler/service").SchedulerService>("scheduler");
  registerDefaultTasks(scheduler, kernel);
  app = createRouter(kernel);
});

describe("Admin dashboard route", () => {
  it("GET /api/admin/dashboard returns 200 with comprehensive data", async () => {
    const res = await req("/api/admin/dashboard");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.timestamp).toBe("string");
    expect(body.database).toBeDefined();
    expect(body.llm).toBeDefined();
    expect(body.scheduler).toBeDefined();
    expect(body.recentActivity).toBeDefined();
    expect(body.settings).toBeDefined();
  });

  it("dashboard includes database stats", async () => {
    const res = await req("/api/admin/dashboard");
    const body = await res.json() as Record<string, unknown>;
    const db = body.database as Record<string, unknown>;
    expect(typeof db.sizeBytes).toBe("number");
    expect(typeof db.sizeMB).toBe("number");
    expect(typeof db.documents).toBe("number");
    expect(typeof db.chunks).toBe("number");
    expect(typeof db.wikiPages).toBe("number");
    expect(typeof db.chatSessions).toBe("number");
    expect(typeof db.chatMessages).toBe("number");
    expect(typeof db.memoryEntries).toBe("number");
    expect(typeof db.searchQueries).toBe("number");
    expect(typeof db.tags).toBe("number");
  });

  it("dashboard includes scheduler info with task details", async () => {
    const res = await req("/api/admin/dashboard");
    const body = await res.json() as Record<string, unknown>;
    const scheduler = body.scheduler as Record<string, unknown>;
    expect(typeof scheduler.tasks).toBe("number");
    expect(typeof scheduler.running).toBe("number");
    expect(Array.isArray(scheduler.taskDetails)).toBe(true);
    expect((scheduler.tasks as number)).toBeGreaterThan(0);
  });

  it("dashboard includes recent activity as an array", async () => {
    const res = await req("/api/admin/dashboard");
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.recentActivity)).toBe(true);
  });

  it("dashboard includes relevant settings", async () => {
    const res = await req("/api/admin/dashboard");
    const body = await res.json() as Record<string, unknown>;
    const settings = body.settings as Record<string, unknown>;
    expect(typeof settings.rateLimitEnabled).toBe("boolean");
    expect(typeof settings.rateLimitMax).toBe("number");
    expect(typeof settings.autoBackupEnabled).toBe("boolean");
    expect(typeof settings.ragChunkMode).toBe("string");
    expect(typeof settings.wikiAgentsEnabled).toBe("boolean");
  });
});
