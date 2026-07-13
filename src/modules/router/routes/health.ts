import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import { countRows } from "../../../utils/db-helpers";

export function setupHealthRoutes(app: Hono, kernel: Kernel): void {
  app.get("/api/status", (c) => {
    return c.json({ status: "ok", version: "0.1.0" });
  });

  app.get("/api/health", (c) => {
    const db = kernel.get<import("bun:sqlite").Database>("db");
    const llm = kernel.get<{ status: () => { chat: boolean; embed: boolean; vision: boolean; gpu: boolean; mtp: boolean } }>("llm");
    const scheduler = kernel.get<{ getStatus: () => { name: string; intervalMs: number; lastRun: number | null; running: boolean; nextRun: number }[] }>("scheduler");

    const docCount = countRows(db, "documents");
    const chunkCount = countRows(db, "chunks");
    const wikiCount = countRows(db, "wiki_pages");
    const sessionCount = countRows(db, "chat_sessions");
    const messageCount = countRows(db, "chat_messages");
    const memoryCount = countRows(db, "user_memory");

    const dbSize = db.query("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get() as { size: number } | undefined;

    return c.json({
      status: "ok",
      version: "0.1.0",
      uptime: process.uptime(),
      database: {
        sizeBytes: dbSize?.size ?? 0,
        documents: docCount,
        chunks: chunkCount,
        wikiPages: wikiCount,
        chatSessions: sessionCount,
        chatMessages: messageCount,
        memoryEntries: memoryCount,
      },
      llm: llm.status(),
      scheduler: {
        tasks: scheduler.getStatus().length,
      },
    });
  });
}
