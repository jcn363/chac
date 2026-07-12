import type { Context } from "hono";
import { AppError } from "../../errors";
import { extractErrorMessage } from "../../utils/db-helpers";

/** Wrap an async route handler with error handling. AppError passes through; others become 500. */
export function wrap(fn: (c: Context) => Promise<Response> | Response) {
  return async (c: Context) => {
    try {
      return await fn(c);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(extractErrorMessage(err), "INTERNAL_ERROR", 500);
    }
  };
}

export function safeInt(value: string | undefined, fallback: number, max = 100): number {
  if (value === undefined) return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}
