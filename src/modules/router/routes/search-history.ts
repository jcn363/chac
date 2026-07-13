import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { SearchHistoryService } from "../../documents/search-history";
import { safeInt } from "../utils";

export function setupSearchHistoryRoutes(app: Hono, kernel: Kernel): void {
  const searchHistory = kernel.get<SearchHistoryService>("searchHistory");

  app.get("/api/search/history", (c) => {
    const limit = safeInt(c.req.query("limit"), 50);
    return c.json(searchHistory.getSearchHistory({ limit }));
  });

  app.get("/api/search/analytics", (c) => {
    return c.json(searchHistory.getSearchAnalytics());
  });

  app.delete("/api/search/history", (c) => {
    searchHistory.clearSearchHistory();
    return c.json({ ok: true });
  });
}
