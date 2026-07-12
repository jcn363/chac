import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { DocumentsService } from "../../documents/service";
import type { DocumentSearchService } from "../../documents/search";

export function setupCacheRoutes(app: Hono, kernel: Kernel): void {
  const docs = kernel.get<DocumentsService>("docs");
  const search = kernel.get<DocumentSearchService>("search");

  app.get("/api/cache/stats", (c) => {
    return c.json({
      ...docs.getCacheStats(),
      ...search.getCacheStats(),
    });
  });

  app.post("/api/cache/clear", (c) => {
    docs.clearCache();
    search.clearCache();
    return c.json({ ok: true });
  });
}
