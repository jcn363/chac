import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { MemoryService } from "../../memory/service";

export function setupMemoryRoutes(app: Hono, kernel: Kernel): void {
  const memory = kernel.get<MemoryService>("memory");

  app.get("/api/memory", (c) => {
    return c.json(memory.list());
  });

  app.put("/api/memory", async (c) => {
    const body = await c.req.json<{ category: string; key: string; value: string }>();
    if (!body?.category || !body?.key || !body?.value) {
      return c.json({ error: "Missing required fields: category, key, value" }, 400);
    }
    const validCategories = ["preference", "topic", "fact", "summary"];
    if (!validCategories.includes(body.category)) {
      return c.json({ error: "Invalid category" }, 400);
    }
    const entry = memory.upsert(body.category as "preference" | "topic" | "fact" | "summary", body.key, body.value, "manual");
    return c.json(entry);
  });

  app.delete("/api/memory/:id", (c) => {
    const deleted = memory.delete(c.req.param("id"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });
}
