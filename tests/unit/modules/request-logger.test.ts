import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { requestLogger, getRequestLogs, clearRequestLogs } from "../../../src/modules/router/request-logger";

function createTestApp() {
  const app = new Hono();
  app.use("*", requestLogger());
  app.get("/test", (c) => c.json({ ok: true }));
  app.get("/error", (c) => {
    throw new Error("boom");
  });
  app.get("/static/app.js", (c) => c.text("js"));
  app.get("/static/style.css", (c) => c.text("css"));
  return app;
}

describe("requestLogger", () => {
  beforeEach(() => {
    clearRequestLogs();
  });

  it("logs method, path, status, and duration", async () => {
    const app = createTestApp();
    const res = await app.request("/test");
    expect(res.status).toBe(200);

    const logs = getRequestLogs();
    expect(logs.length).toBe(1);
    const entry = logs[0]!;
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/test");
    expect(entry.status).toBe(200);
    expect(entry.duration).toBeGreaterThanOrEqual(0);
    expect(entry.timestamp).toBeTruthy();
  });

  it("records IP from x-forwarded-for header", async () => {
    const app = createTestApp();
    await app.request("/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const logs = getRequestLogs();
    expect(logs[0]!.ip).toBe("1.2.3.4");
  });

  it("records IP from x-real-ip when x-forwarded-for missing", async () => {
    const app = createTestApp();
    await app.request("/test", {
      headers: { "x-real-ip": "5.6.7.8" },
    });

    const logs = getRequestLogs();
    expect(logs[0]!.ip).toBe("5.6.7.8");
  });

  it("clearRequestLogs empties the log buffer", async () => {
    const app = createTestApp();
    await app.request("/test");
    expect(getRequestLogs().length).toBe(1);

    clearRequestLogs();
    expect(getRequestLogs().length).toBe(0);
  });

  it("logs non-200 status codes", async () => {
    const app = new Hono();
    app.use("*", requestLogger());
    app.get("/not-found", (c) => c.json({ error: "not found" }, 404));

    const res = await app.request("/not-found");
    expect(res.status).toBe(404);

    const logs = getRequestLogs();
    expect(logs[0]!.status).toBe(404);
  });
});
