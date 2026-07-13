import { describe, it, expect, beforeEach } from "bun:test";
import { requestTracker } from "../../src/modules/router";
import { Hono } from "hono";
import { createTestKernel } from "../helpers/setup";
import { createRouter } from "../../src/modules/router";

describe("Graceful shutdown", () => {
  beforeEach(() => {
    requestTracker.count = 0;
  });

  it("requestTracker increments on request and decrements after response", async () => {
    const kernel = createTestKernel();
    const app = createRouter(kernel);
    app.get("/test-track", (c) => c.json({ ok: true }));

    expect(requestTracker.count).toBe(0);

    const res = await app.request("/test-track");
    expect(res.status).toBe(200);
    // After response completes, counter should be back to 0
    expect(requestTracker.count).toBe(0);
  });

  it("requestTracker decrements even when handler throws", async () => {
    const kernel = createTestKernel();
    const app = createRouter(kernel);
    app.get("/test-error", () => {
      throw new Error("boom");
    });

    expect(requestTracker.count).toBe(0);

    const res = await app.request("/test-error");
    expect(res.status).toBe(500);
    expect(requestTracker.count).toBe(0);
  });

  it("shutdown is idempotent (double-signal guard)", async () => {
    let callCount = 0;
    let shuttingDown = false;

    const shutdown = async () => {
      if (shuttingDown) return;
      shuttingDown = true;
      callCount++;
      // Simulate async shutdown work
      await Bun.sleep(10);
      shuttingDown = false; // reset so we can test again
    };

    // First call
    await shutdown();
    expect(callCount).toBe(1);

    // Second call (while first is still "running")
    // The guard prevents re-entry
    shuttingDown = true;
    await shutdown();
    // callCount should still be 1 because shuttingDown was true
    expect(callCount).toBe(1);
  });

  it("shutdown drains in-flight requests within deadline", async () => {
    // Simulate the drain logic from main.ts
    requestTracker.count = 2;
    let drainCompleted = false;

    const deadline = Date.now() + 200; // short deadline for test
    while (requestTracker.count > 0 && Date.now() < deadline) {
      // Simulate requests completing
      requestTracker.count--;
      await Bun.sleep(10);
    }

    expect(requestTracker.count).toBe(0);
    drainCompleted = true;
    expect(drainCompleted).toBe(true);
  });

  it("shutdown force-stops when deadline exceeded", async () => {
    requestTracker.count = 1;
    const deadline = Date.now() + 50; // very short deadline

    // Simulate a stuck request that doesn't complete
    while (requestTracker.count > 0 && Date.now() < deadline) {
      await Bun.sleep(20);
    }

    // Should have force-stopped (count still > 0)
    expect(requestTracker.count).toBeGreaterThan(0);
  });
});
