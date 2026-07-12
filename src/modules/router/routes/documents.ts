import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { DocumentsService } from "../../documents/service";
import type { DocumentSearchService } from "../../documents/search";
import type { SettingsServiceType } from "../../settings/types";
import { safeInt, wrap } from "../utils";

export function setupDocumentRoutes(app: Hono, kernel: Kernel): void {
  const docs = kernel.get<DocumentsService>("docs");
  const search = kernel.get<DocumentSearchService>("search");
  const settings = kernel.get<SettingsServiceType>("settings");

  app.get("/api/documents", (c) => {
    const page = safeInt(c.req.query("page"), 1);
    const perPage = safeInt(c.req.query("per_page"), (settings.get("ui.documents_per_page") as number) ?? 20);
    return c.json(docs.list({ page, perPage }));
  });

  app.get("/api/documents/status", (c) => {
    return c.json(docs.getStatus());
  });

  app.post("/api/documents", wrap(async (c) => {
    const body = await c.req.json<{ path: string }>();
    if (!body?.path || typeof body.path !== "string") {
      return c.json({ error: "Missing or invalid path" }, 400);
    }
    const result = await docs.ingest(body.path);
    return c.json(result, 201);
  }));

  app.post("/api/documents/batch", wrap(async (c) => {
    const body = await c.req.json<{ paths: string[] }>();
    if (!body?.paths || !Array.isArray(body.paths) || body.paths.length === 0) {
      return c.json({ error: "Missing or invalid paths array" }, 400);
    }
    if (body.paths.length > 50) {
      return c.json({ error: "Maximum 50 files per batch" }, 400);
    }
    const result = await docs.batchIngest(body.paths);
    return c.json(result, 201);
  }));

  app.post("/api/documents/batch/delete", async (c) => {
    const body = await c.req.json<{ ids: string[] }>();
    if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return c.json({ error: "Missing or invalid ids array" }, 400);
    }
    const result = docs.batchDelete(body.ids);
    return c.json(result);
  });

  app.get("/api/documents/:id", (c) => {
    const doc = docs.get(c.req.param("id"));
    if (!doc) return c.json({ error: "Not found" }, 404);
    return c.json(doc);
  });

  app.delete("/api/documents/:id", (c) => {
    const deleted = docs.delete(c.req.param("id"));
    if (!deleted) return c.json({ error: "Not found" }, 404);
    return c.json({ ok: true });
  });

  app.post("/api/documents/:id/reingest", wrap(async (c) => {
    const id = c.req.param("id") as string;
    const result = await docs.reingest(id);
    return c.json(result);
  }));

  app.post("/api/documents/search", wrap(async (c) => {
    const body = await c.req.json<{ query: string; limit?: number; rerank?: boolean; expand?: boolean }>();
    if (!body?.query || typeof body.query !== "string") {
      return c.json({ error: "Missing or invalid query" }, 400);
    }
    const limit = body.limit ? safeInt(String(body.limit), 5) : 5;
    const results = await search.search(body.query, {
      limit,
      rerank: body.rerank ?? false,
      expand: body.expand ?? false,
    });
    return c.json(results);
  }));
}
