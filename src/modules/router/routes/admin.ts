import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import { countRows } from "../../../utils/db-helpers";
import { getRequestLogs } from "../request-logger";

export function setupAdminRoutes(app: Hono, kernel: Kernel): void {
  app.get("/api/admin/dashboard", (c) => {
    const db = kernel.get<import("bun:sqlite").Database>("db");
    const llm = kernel.get<{ status: () => unknown }>("llm");
    const scheduler = kernel.get<{ getStatus: () => unknown[] }>("scheduler");
    const settings = kernel.get<{ get: (key: string) => unknown }>("settings");

    // Database stats
    const docCount = countRows(db, "documents");
    const chunkCount = countRows(db, "chunks");
    const wikiCount = countRows(db, "wiki_pages");
    const sessionCount = countRows(db, "chat_sessions");
    const messageCount = countRows(db, "chat_messages");
    const memoryCount = countRows(db, "user_memory");
    const searchCount = countRows(db, "search_history");
    const tagCount = countRows(db, "document_tags");

    const dbSize = db.query("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as { size: number } | undefined;

    // Recent activity
    const recentLogs = getRequestLogs().slice(-20);

    // Scheduler status
    const tasks = scheduler.getStatus() as Array<{ name: string; lastRun: number | null; running: boolean }>;
    const runningTasks = tasks.filter((t) => t.running).length;

    return c.json({
      timestamp: new Date().toISOString(),
      database: {
        sizeBytes: dbSize?.size ?? 0,
        sizeMB: Math.round(((dbSize?.size ?? 0) / 1024 / 1024) * 100) / 100,
        documents: docCount,
        chunks: chunkCount,
        wikiPages: wikiCount,
        chatSessions: sessionCount,
        chatMessages: messageCount,
        memoryEntries: memoryCount,
        searchQueries: searchCount,
        tags: tagCount,
      },
      llm: llm.status(),
      scheduler: {
        tasks: tasks.length,
        running: runningTasks,
        taskDetails: tasks,
      },
      recentActivity: recentLogs,
      settings: {
        rateLimitEnabled: settings.get("server.rate_limit_enabled"),
        rateLimitMax: settings.get("server.rate_limit_max"),
        autoBackupEnabled: settings.get("scheduler.auto_backup_enabled"),
        ragChunkMode: settings.get("rag.chunk_mode"),
        wikiAgentsEnabled: settings.get("wiki.agents_enabled"),
      },
    });
  });
}
