import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { WikiService } from "../../wiki/service";
import type { SettingsServiceType } from "../../settings/types";
import { safeInt, wrap } from "../utils";

export function setupWikiRoutes(app: Hono, kernel: Kernel): void {
  const wiki = kernel.get<WikiService>("wiki");
  const settings = kernel.get<SettingsServiceType>("settings");

  app.get("/api/wiki", (c) => {
    const page = safeInt(c.req.query("page"), 1);
    const perPage = safeInt(c.req.query("per_page"), (settings.get("ui.documents_per_page") as number) ?? 20);
    return c.json(wiki.list({ page, perPage }));
  });

  app.get("/api/wiki/:id", (c) => {
    const page = wiki.get(c.req.param("id"));
    if (!page) return c.json({ error: "Not found" }, 404);
    return c.json(page);
  });

  app.post("/api/wiki/compile", wrap(async (c) => {
    const pages = await wiki.compile();
    return c.json({ compiled: pages.length, pages });
  }));

  app.delete("/api/wiki/:id", (c) => {
    const deleted = wiki.delete(c.req.param("id"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/api/wiki/search", wrap(async (c) => {
    const body = await c.req.json<{ query: string; limit?: number }>();
    if (!body?.query || typeof body.query !== "string") {
      return c.json({ error: "Missing or invalid query" }, 400);
    }
    const limit = body.limit ? safeInt(String(body.limit), 5) : 5;
    const results = await wiki.search(body.query, { limit });
    return c.json(results);
  }));
}
