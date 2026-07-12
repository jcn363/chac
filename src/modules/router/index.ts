import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Kernel } from "../../kernel/types";
import { AppError } from "../../errors";
import { setupApiRoutes } from "./api";
import { setupStaticRoutes } from "./static";
import { setupOpenApi } from "./openapi";

export function createRouter(kernel: Kernel): Hono {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", cors());

  setupStaticRoutes(app);
  setupApiRoutes(app, kernel);
  setupOpenApi(app);

  // Global error handler
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json({ error: err.message, code: err.code, details: err.details }, err.statusCode as 400 | 403 | 404 | 500 | 502);
    }
    console.error("Unhandled error:", err);
    return c.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
  });

  return app;
}
