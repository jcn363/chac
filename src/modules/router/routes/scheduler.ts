import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { SchedulerService } from "../../scheduler/service";

export function setupSchedulerRoutes(app: Hono, kernel: Kernel): void {
  const scheduler = kernel.get<SchedulerService>("scheduler");

  app.get("/api/scheduler/status", (c) => {
    return c.json(scheduler.getStatus());
  });

  app.post("/api/scheduler/run/:name", async (c) => {
    const name = c.req.param("name");
    const success = await scheduler.runNow(name);
    if (!success) return c.json({ error: "Task not found or already running" }, 400);
    return c.json({ ok: true });
  });
}
