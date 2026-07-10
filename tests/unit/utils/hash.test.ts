import { describe, it, expect } from "vitest";
import { contentHash } from "../../../src/utils/hash";

describe("contentHash", () => {
  it("produces consistent hash for same input", async () => {
    const hash1 = await contentHash("hello world");
    const hash2 = await contentHash("hello world");
    expect(hash1).toBe(hash2);
  });

  it("produces different hash for different input", async () => {
    const hash1 = await contentHash("hello");
    const hash2 = await contentHash("world");
    expect(hash1).not.toBe(hash2);
  });

  it("returns 64-char hex string", async () => {
    const hash = await contentHash("test");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles Buffer input", async () => {
    const buf = Buffer.from("hello");
    const hash = await contentHash(buf);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
