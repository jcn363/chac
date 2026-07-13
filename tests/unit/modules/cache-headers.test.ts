import { describe, it, expect, beforeEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { createRouter, rateLimitState } from "../../../src/modules/router";
import type { Kernel } from "../../../src/kernel/types";

let kernel: Kernel;
let app: ReturnType<typeof createRouter>;

function req(path: string) {
  return app.request(path);
}

beforeEach(() => {
  rateLimitState.reset();
  kernel = createTestKernel();
  app = createRouter(kernel);
});

describe("Cache headers", () => {
  it("GET / returns HTML with no-cache header", async () => {
    const res = await req("/");
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toBe("no-cache");
  });

  it("GET /static/app.js returns JS with immutable cache", async () => {
    const res = await req("/static/app.js");
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toBe("public, max-age=31536000, immutable");
  });

  it("GET /static/styles.css returns CSS with immutable cache", async () => {
    const res = await req("/static/styles.css");
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toBe("public, max-age=31536000, immutable");
  });

  it("GET /sw.js returns JS with immutable cache", async () => {
    const res = await req("/sw.js");
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("Cache-Control");
    expect(cacheControl).toBe("public, max-age=31536000, immutable");
  });
});

describe("Security headers", () => {
  it("GET /api/status includes X-Content-Type-Options", async () => {
    const res = await req("/api/status");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("GET /api/status includes X-Frame-Options", async () => {
    const res = await req("/api/status");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("GET /api/status includes Referrer-Policy", async () => {
    const res = await req("/api/status");
    expect(res.status).toBe(200);
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("Security headers present on static routes", async () => {
    const res = await req("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
