interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  totalSet: number;
  totalEvicted: number;
}

export class MemoryCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private defaultTtl: number;
  private maxSize: number;
  private hits = 0;
  private misses = 0;
  private totalSet = 0;
  private totalEvicted = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(defaultTtlMs: number = 5 * 60 * 1000, options?: { maxSize?: number }) {
    this.defaultTtl = defaultTtlMs;
    this.maxSize = options?.maxSize ?? 10000;
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.totalEvicted++;
      this.misses++;
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    if (!this.store.has(key)) {
      this.totalSet++;
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtl),
    });
    // LRU eviction: remove oldest entry when over capacity
    while (this.store.size > this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
        this.totalEvicted++;
      } else {
        break;
      }
    }
  }

  async getOrSet(key: string, factory: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await factory();
    this.set(key, value, ttlMs);
    return value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        removed++;
        this.totalEvicted++;
      }
    }
    return removed;
  }

  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      size: this.store.size,
      totalSet: this.totalSet,
      totalEvicted: this.totalEvicted,
    };
  }

  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.totalSet = 0;
    this.totalEvicted = 0;
  }

  get size(): number {
    return this.store.size;
  }

  /** Start periodic cleanup of expired entries. */
  startCleanup(intervalMs: number = 60000): void {
    this.stopCleanup();
    this.cleanupTimer = setInterval(() => this.cleanup(), intervalMs);
  }

  /** Stop periodic cleanup. */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export const embeddingCache = new MemoryCache<Float32Array>(10 * 60 * 1000, { maxSize: 10000 });
