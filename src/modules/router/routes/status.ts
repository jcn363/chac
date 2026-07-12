import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";

export function setupStatusRoutes(app: Hono, _kernel: Kernel): void {
  app.get("/api/status", (c) => {
    return c.json({ status: "ok", version: "0.1.0" });
  });
}
