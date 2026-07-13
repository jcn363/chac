import { Hono } from "hono";
import type { Kernel } from "../../kernel/types";
import { setupHealthRoutes } from "./routes/health";
import { setupSettingsRoutes } from "./routes/settings";
import { setupLlmRoutes } from "./routes/llm";
import { setupDocumentRoutes } from "./routes/documents";
import { setupSearchHistoryRoutes } from "./routes/search-history";
import { setupTagRoutes } from "./routes/tags";
import { setupSuggestRoutes } from "./routes/suggest";
import { setupChatRoutes } from "./routes/chat";
import { setupWikiRoutes } from "./routes/wiki";
import { setupMemoryRoutes } from "./routes/memory";
import { setupCacheRoutes } from "./routes/cache";
import { setupSchedulerRoutes } from "./routes/scheduler";
import { setupBackupRoutes } from "./routes/backup";
import { setupAdminRoutes } from "./routes/admin";
import { setupObsidianRoutes } from "./routes/obsidian";

export function setupApiRoutes(app: Hono, kernel: Kernel): void {
  setupHealthRoutes(app, kernel);
  setupSettingsRoutes(app, kernel);
  setupLlmRoutes(app, kernel);
  setupDocumentRoutes(app, kernel);
  setupSearchHistoryRoutes(app, kernel);
  setupTagRoutes(app, kernel);
  setupSuggestRoutes(app, kernel);
  setupChatRoutes(app, kernel);
  setupWikiRoutes(app, kernel);
  setupMemoryRoutes(app, kernel);
  setupCacheRoutes(app, kernel);
  setupSchedulerRoutes(app, kernel);
  setupBackupRoutes(app, kernel);
  setupAdminRoutes(app, kernel);
  setupObsidianRoutes(app, kernel);
}
