import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Kernel } from "../../kernel/types";
import { AppError } from "../../errors";
import { setupApiRoutes } from "./api";
import { setupStaticRoutes } from "./static";
import { setupOpenApi } from "./openapi";
import { rateLimit, createRateLimitState } from "./rate-limit";
import { requestLogger } from "./request-logger";
import { createLogger } from "../../utils/logger";

const log = createLogger("router");

export const rateLimitState = createRateLimitState();
export const requestTracker = { count: 0 };

export function createRouter(kernel: Kernel): Hono {
  const app = new Hono();
  const settings = kernel.get<import("../settings/types").SettingsServiceType>("settings");

  app.use("*", requestLogger());
  app.use("*", cors());
  app.use("*", rateLimit(settings, rateLimitState));

  // Security headers
  app.use("*", async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  });

  // Track in-flight requests for graceful shutdown
  app.use("*", async (c, next) => {
    requestTracker.count++;
    try {
      await next();
    } finally {
      requestTracker.count--;
    }
  });

  setupStaticRoutes(app);
  setupApiRoutes(app, kernel);
  setupOpenApi(app);

  // Global error handler
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code, details: err.details }, err.statusCode as 400 | 403 | 404 | 500 | 502);
    }
    log.error("Unhandled error", { error: err.message, stack: err.stack });
    return c.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  });

  return app;
}
