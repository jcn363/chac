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

describe("Status routes", () => {
  it("GET /api/status returns ok", async () => {
    const res = await req("/api/status");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
  });

  it("GET /api/health returns detailed system info", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.version).toBe("0.1.0");
    expect(typeof body.uptime).toBe("number");
  });

  it("GET /api/health includes database stats", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const db = body.database as Record<string, unknown>;
    expect(db).toBeDefined();
    expect(typeof db.sizeBytes).toBe("number");
    expect(typeof db.documents).toBe("number");
    expect(typeof db.chunks).toBe("number");
    expect(typeof db.wikiPages).toBe("number");
    expect(typeof db.chatSessions).toBe("number");
    expect(typeof db.chatMessages).toBe("number");
    expect(typeof db.memoryEntries).toBe("number");
  });

  it("GET /api/health includes LLM status", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const llm = body.llm as Record<string, unknown>;
    expect(llm).toBeDefined();
    expect(typeof llm.chat).toBe("boolean");
    expect(typeof llm.embed).toBe("boolean");
    expect(typeof llm.vision).toBe("boolean");
  });

  it("GET /api/health includes scheduler info", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    const scheduler = body.scheduler as Record<string, unknown>;
    expect(scheduler).toBeDefined();
    expect(typeof scheduler.tasks).toBe("number");
    expect((scheduler.tasks as number)).toBeGreaterThan(0);
  });
});
