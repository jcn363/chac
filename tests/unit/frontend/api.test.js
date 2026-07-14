import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { apiGet, apiPost, apiPut, apiDelete, apiUpload, onWsMessage, sendWsMessage, connectWebSocket } from "../../../src/public/js/lib/api.js";

// --- fetch mock ---
let fetchMock;
let lastFetchCall;

function setupFetch(statusCode, body) {
  lastFetchCall = null;
  fetchMock = mock((url, opts) => {
    lastFetchCall = { url, opts };
    return Promise.resolve({
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      json: () => Promise.resolve(body),
    });
  });
  globalThis.fetch = fetchMock;
}

function teardownFetch() {
  delete globalThis.fetch;
}

// --- apiGet ---
describe("apiGet", () => {
  beforeEach(() => setupFetch(200, { ok: true }));
  afterEach(teardownFetch);

  it("calls fetch with correct URL", async () => {
    await apiGet("/api/settings");
    expect(lastFetchCall.url).toBe("/api/settings");
    expect(lastFetchCall.opts).toBeUndefined();
  });

  it("returns parsed JSON on success", async () => {
    const result = await apiGet("/api/settings");
    expect(result).toEqual({ ok: true });
  });

  it("throws on non-OK response", async () => {
    setupFetch(404, { error: "not found" });
    await expect(apiGet("/api/missing")).rejects.toThrow("not found");
  });

  it("throws on 500", async () => {
    setupFetch(500, { error: "server" });
    await expect(apiGet("/api/fail")).rejects.toThrow("server");
  });
});

// --- apiPost ---
describe("apiPost", () => {
  beforeEach(() => setupFetch(200, { created: true }));
  afterEach(teardownFetch);

  it("calls fetch with POST method and JSON body", async () => {
    await apiPost("/api/chat", { message: "hello" });
    expect(lastFetchCall.url).toBe("/api/chat");
    expect(lastFetchCall.opts.method).toBe("POST");
    expect(lastFetchCall.opts.headers["Content-Type"]).toBe("application/json");
    expect(lastFetchCall.opts.body).toBe(JSON.stringify({ message: "hello" }));
  });

  it("returns parsed JSON", async () => {
    const result = await apiPost("/api/chat", { message: "hi" });
    expect(result).toEqual({ created: true });
  });

  it("throws on error status", async () => {
    setupFetch(400, { error: "bad request" });
    await expect(apiPost("/api/chat", {})).rejects.toThrow("bad request");
  });
});

// --- apiPut ---
describe("apiPut", () => {
  beforeEach(() => setupFetch(200, { updated: true }));
  afterEach(teardownFetch);

  it("calls fetch with PUT method and JSON body", async () => {
    await apiPut("/api/settings/llm", { model: "new-model" });
    expect(lastFetchCall.url).toBe("/api/settings/llm");
    expect(lastFetchCall.opts.method).toBe("PUT");
    expect(lastFetchCall.opts.headers["Content-Type"]).toBe("application/json");
    expect(lastFetchCall.opts.body).toBe(JSON.stringify({ model: "new-model" }));
  });

  it("returns parsed JSON", async () => {
    const result = await apiPut("/api/settings/llm", {});
    expect(result).toEqual({ updated: true });
  });

  it("throws on error status", async () => {
    setupFetch(422, { error: "validation" });
    await expect(apiPut("/api/settings/llm", {})).rejects.toThrow("validation");
  });
});

// --- apiDelete ---
describe("apiDelete", () => {
  beforeEach(() => setupFetch(200, { deleted: true }));
  afterEach(teardownFetch);

  it("calls fetch with DELETE method", async () => {
    await apiDelete("/api/documents/42");
    expect(lastFetchCall.url).toBe("/api/documents/42");
    expect(lastFetchCall.opts.method).toBe("DELETE");
  });

  it("returns parsed JSON", async () => {
    const result = await apiDelete("/api/documents/42");
    expect(result).toEqual({ deleted: true });
  });

  it("throws on error status", async () => {
    setupFetch(404, { error: "not found" });
    await expect(apiDelete("/api/documents/999")).rejects.toThrow("not found");
  });
});

// --- sendWsMessage ---
describe("sendWsMessage", () => {
  it("returns false when no WebSocket is connected", () => {
    const result = sendWsMessage({ type: "ping" });
    expect(result).toBe(false);
  });
});

// --- non-JSON error fallback ---
describe("non-JSON error responses", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("apiGet falls back to API error status when response is not JSON", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.reject(new Error("not json")),
      })
    );
    await expect(apiGet("/api/bad")).rejects.toThrow("API error: 502");
  });

  it("apiPost falls back to API error status when response is not JSON", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("not json")),
      })
    );
    await expect(apiPost("/api/fail", {})).rejects.toThrow("API error: 500");
  });

  it("apiPut falls back to API error status when response is not JSON", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 422,
        json: () => Promise.reject(new Error("not json")),
      })
    );
    await expect(apiPut("/api/fail", {})).rejects.toThrow("API error: 422");
  });

  it("apiDelete falls back to API error status when response is not JSON", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.reject(new Error("not json")),
      })
    );
    await expect(apiDelete("/api/fail")).rejects.toThrow("API error: 403");
  });

  it("apiUpload falls back to API error status when response is not JSON", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 413,
        json: () => Promise.reject(new Error("not json")),
      })
    );
    await expect(apiUpload("/api/upload", {})).rejects.toThrow("API error: 413");
  });
});

// --- onWsMessage ---
describe("onWsMessage", () => {
  it("registers a handler (no error thrown)", () => {
    const handler = () => {};
    onWsMessage("chat:chunk", handler);
    // No assertion needed — just verifying no crash
  });
});

// --- apiUpload ---
describe("apiUpload", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ uploaded: true }),
      })
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends POST with FormData body", async () => {
    const file = new Blob(["test"], { type: "text/plain" });
    const result = await apiUpload("/api/documents/upload", file);
    expect(result).toEqual({ uploaded: true });
  });

  it("throws on non-OK response with JSON error", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "file too large" }),
      })
    );
    await expect(apiUpload("/api/upload", {})).rejects.toThrow("file too large");
  });
});
