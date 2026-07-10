import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = "http://localhost:3000";
let server: Bun.ChildProcess;

beforeAll(async () => {
  server = Bun.spawn(["bun", "run", "src/main.ts"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await Bun.sleep(2000);
});

afterAll(() => {
  server.kill("SIGTERM");
});

describe("E2E API", () => {
  it("GET /api/status", async () => {
    const res = await fetch(`${BASE}/api/status`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  it("GET /api/settings", async () => {
    const res = await fetch(`${BASE}/api/settings`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("GET /api/llm/status", async () => {
    const res = await fetch(`${BASE}/api/llm/status`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("chat");
    expect(data).toHaveProperty("embed");
  });

  it("GET /api/documents", async () => {
    const res = await fetch(`${BASE}/api/documents`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("documents");
    expect(data).toHaveProperty("total");
  });

  it("GET /api/chat/sessions", async () => {
    const res = await fetch(`${BASE}/api/chat/sessions`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("GET /api/wiki", async () => {
    const res = await fetch(`${BASE}/api/wiki`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data).toHaveProperty("pages");
  });
});
