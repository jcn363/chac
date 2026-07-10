import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Kernel } from "../../kernel/types";
import { setupApiRoutes } from "./api";
import { setupStaticRoutes } from "./static";

export function createRouter(kernel: Kernel): Hono {
  const app = new Hono();

  app.use("*", logger());
  app.use("*", cors());

  setupStaticRoutes(app);
  setupApiRoutes(app, kernel);

  return app;
}
