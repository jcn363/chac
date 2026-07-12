import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { ChatService } from "../../chat/service";
import { exportDatabase, importDatabase } from "../../../database";
import { wrap } from "../utils";

export function setupBackupRoutes(app: Hono, kernel: Kernel): void {
  const chat = kernel.get<ChatService>("chat");

  app.get("/api/backup", (c) => {
    const data = exportDatabase();
    return c.json(data);
  });

  app.post("/api/restore", wrap(async (c) => {
    const body = await c.req.json<{ tables: Record<string, unknown[][]>; version?: string; timestamp?: string }>();
    if (!body?.tables || typeof body.tables !== "object") {
      return c.json({ error: "Missing or invalid backup data" }, 400);
    }
    importDatabase({ version: body.version ?? "1.0.0", timestamp: body.timestamp ?? new Date().toISOString(), tables: body.tables });
    chat.invalidateIndexes();
    return c.json({ ok: true, message: "Database restored successfully" });
  }));
}
