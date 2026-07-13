import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { rateLimit, createRateLimitState } from "../../../src/modules/router/rate-limit";
import type { SettingsServiceType } from "../../../src/modules/settings/types";

function createMockSettings(overrides: Record<string, unknown> = {}): SettingsServiceType {
  const defaults: Record<string, unknown> = {
    "server.rate_limit_enabled": true,
    "server.rate_limit_max": 100,
    ...overrides,
  };
  return {
    get: (key: string) => defaults[key],
    getAll: () => [],
    set: () => ({ success: true }),
    onChange: () => {},
  };
}

function createTestApp(settings: SettingsServiceType, state?: ReturnType<typeof createRateLimitState>) {
  const app = new Hono();
  app.use("*", rateLimit(settings, state));
  app.get("/test", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit middleware", () => {
  let state: ReturnType<typeof createRateLimitState>;

  beforeEach(() => {
    state = createRateLimitState();
  });

  it("allows requests under the limit", async () => {
    const app = createTestApp(createMockSettings(), state);
    const res = await app.request("/test", { headers: { "x-forwarded-for": "1.2.3.4" } });
    expect(res.status).toBe(200);
  });

  it("returns 429 when limit exceeded", async () => {
    const app = createTestApp(createMockSettings({ "server.rate_limit_max": 2 }), state);
    const ip = "10.0.0.1";

    await app.request("/test", { headers: { "x-forwarded-for": ip } });
    await app.request("/test", { headers: { "x-forwarded-for": ip } });
    const res = await app.request("/test", { headers: { "x-forwarded-for": ip } });

    expect(res.status).toBe(429);
    const body = await res.json() as { error: string; retryAfter: number };
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retryAfter).toBeGreaterThan(0);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("resets after window expires", async () => {
    const app = createTestApp(createMockSettings({ "server.rate_limit_max": 1 }), state);
    const ip = "10.0.0.2";

    // Hit the limit
    await app.request("/test", { headers: { "x-forwarded-for": ip } });
    const blocked = await app.request("/test", { headers: { "x-forwarded-for": ip } });
    expect(blocked.status).toBe(429);

    // Manually expire the entry
    const entry = state.hits.get(ip);
    if (entry) entry.resetAt = Date.now() - 1;

    // Should pass now
    const res = await app.request("/test", { headers: { "x-forwarded-for": ip } });
    expect(res.status).toBe(200);
  });

  it("skips rate limiting when disabled", async () => {
    const app = createTestApp(createMockSettings({ "server.rate_limit_enabled": false }), state);
    const ip = "10.0.0.3";

    for (let i = 0; i < 5; i++) {
      const res = await app.request("/test", { headers: { "x-forwarded-for": ip } });
      expect(res.status).toBe(200);
    }
  });

  it("tracks different IPs independently", async () => {
    const app = createTestApp(createMockSettings({ "server.rate_limit_max": 1 }), state);

    await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.10" } });
    const blocked = await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.10" } });
    expect(blocked.status).toBe(429);

    // Different IP should still work
    const ok = await app.request("/test", { headers: { "x-forwarded-for": "10.0.0.11" } });
    expect(ok.status).toBe(200);
  });

  it("uses x-real-ip as fallback", async () => {
    const app = createTestApp(createMockSettings({ "server.rate_limit_max": 1 }), state);

    await app.request("/test", { headers: { "x-real-ip": "192.168.1.1" } });
    const res = await app.request("/test", { headers: { "x-real-ip": "192.168.1.1" } });
    expect(res.status).toBe(429);
  });

  it("defaults to unknown when no IP headers present", async () => {
    const app = createTestApp(createMockSettings({ "server.rate_limit_max": 1 }), state);

    await app.request("/test");
    const res = await app.request("/test");
    expect(res.status).toBe(429);
  });

  it("uses configurable max from settings", async () => {
    const app = createTestApp(createMockSettings({ "server.rate_limit_max": 3 }), state);
    const ip = "10.0.0.20";

    const r1 = await app.request("/test", { headers: { "x-forwarded-for": ip } });
    const r2 = await app.request("/test", { headers: { "x-forwarded-for": ip } });
    const r3 = await app.request("/test", { headers: { "x-forwarded-for": ip } });
    const r4 = await app.request("/test", { headers: { "x-forwarded-for": ip } });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(r4.status).toBe(429);
  });
});
