import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { DocumentTagsService } from "../../documents/tags";
import { safeInt, wrap } from "../utils";

export function setupTagRoutes(app: Hono, kernel: Kernel): void {
  const tags = kernel.get<DocumentTagsService>("tags");

  app.get("/api/tags", (c) => {
    return c.json(tags.listTags());
  });

  app.get("/api/tags/:tag/documents", (c) => {
    const page = safeInt(c.req.query("page"), 1);
    const perPage = safeInt(c.req.query("per_page"), 20);
    return c.json(tags.getDocumentsByTag(c.req.param("tag"), { page, perPage }));
  });

  app.put("/api/documents/:id/tags", wrap(async (c) => {
    const id = c.req.param("id") as string;
    const body = await c.req.json<{ tags: string[] }>();
    if (!body?.tags || !Array.isArray(body.tags)) {
      return c.json({ error: "Missing or invalid tags array" }, 400);
    }
    tags.setDocumentTags(id, body.tags);
    return c.json({ tags: tags.getDocumentTags(id) });
  }));

  app.post("/api/documents/:id/tags", wrap(async (c) => {
    const id = c.req.param("id") as string;
    const body = await c.req.json<{ tags: string[] }>();
    if (!body?.tags || !Array.isArray(body.tags)) {
      return c.json({ error: "Missing or invalid tags array" }, 400);
    }
    tags.addTags(id, body.tags);
    return c.json({ tags: tags.getDocumentTags(id) });
  }));

  app.delete("/api/documents/:id/tags", wrap(async (c) => {
    const body = await c.req.json<{ tags: string[] }>();
    if (!body?.tags || !Array.isArray(body.tags)) {
      return c.json({ error: "Missing or invalid tags array" }, 400);
    }
    tags.removeTags(c.req.param("id")!, body.tags);
    return c.json({ tags: tags.getDocumentTags(c.req.param("id")!) });
  }));
}
