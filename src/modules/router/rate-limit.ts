import type { Context, Next } from "hono";
import type { SettingsServiceType } from "../settings/types";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000; // 1 minute
const CLEANUP_INTERVAL_MS = 300_000; // 5 minutes

export function createRateLimitState() {
  const hits = new Map<string, RateLimitEntry>();
  let cleanupTimer: ReturnType<typeof setInterval> | undefined;

  function startCleanup() {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of hits) {
        if (entry.resetAt < now) hits.delete(key);
      }
    }, CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
  }

  function stopCleanup() {
    if (cleanupTimer) {
      clearInterval(cleanupTimer);
      cleanupTimer = undefined;
    }
  }

  function reset() {
    hits.clear();
  }

  return { hits, startCleanup, stopCleanup, reset };
}

export function rateLimit(settings: SettingsServiceType, state?: ReturnType<typeof createRateLimitState>) {
  const limiter = state ?? createRateLimitState();
  limiter.startCleanup();

  return async (c: Context, next: Next) => {
    if (settings.get("server.rate_limit_enabled") === false) {
      return next();
    }

    const maxRequests = (settings.get("server.rate_limit_max") as number) ?? 100;

    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
      c.req.header("x-real-ip") ??
      "unknown";
    const now = Date.now();
    const entry = limiter.hits.get(ip);

    if (!entry || entry.resetAt < now) {
      limiter.hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    entry.count++;
    if (entry.count > maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Rate limit exceeded", retryAfter }, 429);
    }

    return next();
  };
}
