import { describe, it, expect, beforeEach, mock } from "bun:test";
import { UrlFetcherServiceImpl } from "../../../src/modules/url-fetcher/service";
import { ExternalServiceError } from "../../../src/errors";
import { createTestKernel } from "../../helpers/setup";
import type { Kernel } from "../../../src/kernel/types";

let kernel: Kernel;
let service: UrlFetcherServiceImpl;

beforeEach(() => {
  kernel = createTestKernel();
  service = new UrlFetcherServiceImpl(kernel);
});

describe("UrlFetcherServiceImpl", () => {
  describe("isAccessible", () => {
    it("returns true for reachable URLs", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 200 }))
      ) as unknown as unknown as typeof fetch;

      const result = await service.isAccessible("https://example.com");
      expect(result).toBe(true);

      globalThis.fetch = originalFetch;
    });

    it("returns false for unreachable URLs", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.reject(new Error("Network error"))
      ) as unknown as unknown as typeof fetch;

      const result = await service.isAccessible("https://unreachable.invalid");
      expect(result).toBe(false);

      globalThis.fetch = originalFetch;
    });

    it("returns false for non-OK responses", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response(null, { status: 404, statusText: "Not Found" }))
      ) as unknown as unknown as typeof fetch;

      const result = await service.isAccessible("https://example.com/missing");
      expect(result).toBe(false);

      globalThis.fetch = originalFetch;
    });

    it("returns false on timeout", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 50))
      ) as unknown as unknown as typeof fetch;

      const result = await service.isAccessible("https://slow.example.com");
      expect(result).toBe(false);

      globalThis.fetch = originalFetch;
    });
  });

  describe("fetchUrl", () => {
    it("extracts title from HTML", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            "<html><head><title>Test Page Title</title></head><body><p>Hello</p></body></html>",
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        )
      ) as unknown as typeof fetch;

      const result = await service.fetchUrl("https://example.com");
      expect(result.title).toBe("Test Page Title");

      globalThis.fetch = originalFetch;
    });

    it("returns Untitled when no title tag found", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("<html><body><p>No title here</p></body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          }),
        )
      ) as unknown as typeof fetch;

      const result = await service.fetchUrl("https://example.com");
      expect(result.title).toBe("Untitled");

      globalThis.fetch = originalFetch;
    });

    it("strips HTML tags correctly", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            '<html><head><title>T</title></head><body><div class="main"><h1>Hello</h1><p>World</p></div></body></html>',
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        )
      ) as unknown as typeof fetch;

      const result = await service.fetchUrl("https://example.com");
      expect(result.content).toBe("Hello World");
      expect(result.content).not.toContain("<div");
      expect(result.content).not.toContain("<h1");

      globalThis.fetch = originalFetch;
    });

    it("strips script and style tags", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            '<html><head><title>T</title><script>var x=1;</script><style>.red{color:red}</style></head><body><p>Visible</p></body></html>',
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        )
      ) as unknown as typeof fetch;

      const result = await service.fetchUrl("https://example.com");
      expect(result.content).toBe("Visible");
      expect(result.content).not.toContain("var x=1");
      expect(result.content).not.toContain("color:red");

      globalThis.fetch = originalFetch;
    });

    it("handles text/plain content", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Plain text content here", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
        )
      ) as unknown as typeof fetch;

      const result = await service.fetchUrl("https://example.com/readme.txt");
      expect(result.content).toBe("Plain text content here");
      expect(result.contentType).toBe("text/plain");

      globalThis.fetch = originalFetch;
    });

    it("generates LLM description for content", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            "<html><head><title>T</title></head><body><p>Machine learning is a subset of AI.</p></body></html>",
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        )
      ) as unknown as typeof fetch;

      const result = await service.fetchUrl("https://example.com");
      expect(result.description).toBeDefined();
      expect(typeof result.description).toBe("string");
      expect(result.description!.length).toBeGreaterThan(0);

      globalThis.fetch = originalFetch;
    });

    it("handles fetch errors gracefully", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.reject(new Error("ECONNREFUSED"))
      ) as unknown as typeof fetch;

      await expect(service.fetchUrl("https://unreachable.invalid")).rejects.toThrow(ExternalServiceError);

      globalThis.fetch = originalFetch;
    });

    it("throws ExternalServiceError on HTTP error responses", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Not Found", { status: 404, statusText: "Not Found" }),
        )
      ) as unknown as typeof fetch;

      await expect(service.fetchUrl("https://example.com/missing")).rejects.toThrow(ExternalServiceError);

      globalThis.fetch = originalFetch;
    });

    it("returns correct metadata fields", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            "<html><head><title>Meta Test</title></head><body></body></html>",
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        )
      ) as unknown as typeof fetch;

      const result = await service.fetchUrl("https://example.com");
      expect(result.url).toBe("https://example.com");
      expect(result.contentType).toBe("text/html");
      expect(result.fetchedAt).toBeDefined();
      // Verify fetchedAt is a valid ISO string
      expect(new Date(result.fetchedAt).toISOString()).toBe(result.fetchedAt);

      globalThis.fetch = originalFetch;
    });

    it("handles missing content-type header", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("<p>Content</p>", { status: 200 }),
        )
      ) as unknown as typeof fetch;

      const result = await service.fetchUrl("https://example.com");
      // Default to text/html when content-type is missing
      expect(result.contentType).toBe("text/html");

      globalThis.fetch = originalFetch;
    });

    it("continues without description when LLM fails", async () => {
      // Override kernel to throw on LLM get
      const brokenKernel = {
        get: () => { throw new Error("LLM not available"); },
        provide: kernel.provide.bind(kernel),
        register: kernel.register.bind(kernel),
        start: kernel.start.bind(kernel),
        stop: kernel.stop.bind(kernel),
      } as unknown as Kernel;

      const serviceWithBrokenLlm = new UrlFetcherServiceImpl(brokenKernel);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(
            "<html><head><title>T</title></head><body><p>Content</p></body></html>",
            { status: 200, headers: { "content-type": "text/html" } },
          ),
        )
      ) as unknown as typeof fetch;

      const result = await serviceWithBrokenLlm.fetchUrl("https://example.com");
      expect(result.content).toBe("Content");
      expect(result.description).toBeUndefined();

      globalThis.fetch = originalFetch;
    });
  });
});
