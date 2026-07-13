import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import { getRequestLogs } from "../request-logger";

export function setupStatusRoutes(app: Hono, _kernel: Kernel): void {
  app.get("/api/status", (c) => {
    return c.json({ status: "ok", version: "0.1.0" });
  });

  app.get("/api/logs", (c) => {
    const limit = Number(c.req.query("limit")) || 100;
    const logs = getRequestLogs().slice(-Math.min(limit, 1000));
    return c.json({ logs, total: getRequestLogs().length });
  });
}
