import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { MemoryCache } from "../../../src/utils/cache";

describe("MemoryCache", () => {
  let cache: MemoryCache<string>;

  beforeEach(() => {
    cache = new MemoryCache<string>(1000);
  });

  it("stores and retrieves values", () => {
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("returns undefined for missing keys", () => {
    expect(cache.get("missing")).toBeUndefined();
  });

  it("overwrites existing values", () => {
    cache.set("key1", "first");
    cache.set("key1", "second");
    expect(cache.get("key1")).toBe("second");
  });

  it("respects TTL", async () => {
    cache.set("key1", "value1", 50);
    expect(cache.get("key1")).toBe("value1");
    await Bun.sleep(60);
    expect(cache.get("key1")).toBeUndefined();
  });

  it("deletes entries", () => {
    cache.set("key1", "value1");
    expect(cache.delete("key1")).toBe(true);
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.delete("missing")).toBe(false);
  });

  it("clears all entries", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("has() checks existence", () => {
    cache.set("key1", "value1");
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("missing")).toBe(false);
  });

  it("cleanup removes expired entries", async () => {
    cache.set("key1", "value1", 50);
    cache.set("key2", "value2", 200);
    await Bun.sleep(60);
    const removed = cache.cleanup();
    expect(removed).toBe(1);
    expect(cache.size).toBe(1);
    expect(cache.get("key2")).toBe("value2");
  });

  it("tracks size correctly", () => {
    expect(cache.size).toBe(0);
    cache.set("key1", "value1");
    expect(cache.size).toBe(1);
    cache.set("key2", "value2");
    expect(cache.size).toBe(2);
    cache.delete("key1");
    expect(cache.size).toBe(1);
  });
});

describe("MemoryCache stats", () => {
  let cache: MemoryCache<number>;

  beforeEach(() => {
    cache = new MemoryCache<number>(5000);
    cache.resetStats();
  });

  it("tracks hits and misses", () => {
    cache.set("a", 1);
    cache.get("a"); // hit
    cache.get("b"); // miss
    cache.get("c"); // miss

    const stats = cache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(2);
  });

  it("calculates hit rate", () => {
    cache.set("a", 1);
    cache.get("a"); // hit
    cache.get("a"); // hit
    cache.get("b"); // miss

    const stats = cache.stats();
    expect(stats.hitRate).toBeCloseTo(2 / 3, 2);
  });

  it("reports hit rate of 0 when no accesses", () => {
    const stats = cache.stats();
    expect(stats.hitRate).toBe(0);
  });

  it("tracks totalSet count", () => {
    cache.set("x", 1);
    cache.set("y", 2);
    cache.set("x", 3); // overwrite, not new
    expect(cache.stats().totalSet).toBe(2);
  });

  it("tracks evictions from expired entries", async () => {
    cache.set("expiring", 1, 30);
    await Bun.sleep(40);
    cache.get("expiring"); // triggers expiry eviction
    expect(cache.stats().totalEvicted).toBe(1);
  });

  it("tracks evictions from cleanup", async () => {
    cache.set("a", 1, 30);
    cache.set("b", 2, 30);
    await Bun.sleep(40);
    cache.cleanup();
    expect(cache.stats().totalEvicted).toBe(2);
  });

  it("resetStats clears counters", () => {
    cache.set("a", 1);
    cache.get("a");
    cache.get("missing");
    cache.resetStats();
    const stats = cache.stats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.totalSet).toBe(0);
    expect(stats.totalEvicted).toBe(0);
  });
});

describe("MemoryCache periodic cleanup", () => {
  it("startCleanup starts periodic cleanup", () => {
    const cache = new MemoryCache<string>(5000);
    cache.set("a", "val", 10); // short TTL
    cache.startCleanup(50);
    expect((cache as any).cleanupTimer).not.toBeNull();
    cache.stopCleanup();
  });

  it("stopCleanup clears the timer", () => {
    const cache = new MemoryCache<string>(5000);
    cache.startCleanup(1000);
    cache.stopCleanup();
    expect((cache as any).cleanupTimer).toBeNull();
  });

  it("stopCleanup is safe to call when not started", () => {
    const cache = new MemoryCache<string>(5000);
    cache.stopCleanup(); // should not throw
  });

  it("startCleanup replaces existing timer", () => {
    const cache = new MemoryCache<string>(5000);
    cache.startCleanup(1000);
    cache.startCleanup(2000); // replaces first timer
    expect((cache as any).cleanupTimer).not.toBeNull();
    cache.stopCleanup();
  });
});

describe("MemoryCache getOrSet", () => {
  it("returns cached value without calling factory", async () => {
    const cache = new MemoryCache<string>(5000);
    cache.set("key", "cached");

    let factoryCalls = 0;
    const result = await cache.getOrSet("key", async () => {
      factoryCalls++;
      return "fresh";
    });

    expect(result).toBe("cached");
    expect(factoryCalls).toBe(0);
  });

  it("calls factory and caches result on miss", async () => {
    const cache = new MemoryCache<string>(5000);

    let factoryCalls = 0;
    const result = await cache.getOrSet("key", async () => {
      factoryCalls++;
      return "computed";
    });

    expect(result).toBe("computed");
    expect(factoryCalls).toBe(1);
    expect(cache.get("key")).toBe("computed");
  });

  it("handles factory errors without caching", async () => {
    const cache = new MemoryCache<string>(5000);

    let threw = false;
    try {
      await cache.getOrSet("key", async () => {
        throw new Error("factory error");
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(cache.has("key")).toBe(false);
  });
});
