import type { Kernel } from "../../kernel/types";
import type { SchedulerService } from "./service";
import { exportDatabase } from "../../database";
import { join } from "node:path";
import { writeFileSync, readdirSync, unlinkSync, existsSync, mkdirSync } from "node:fs";

export function registerDefaultTasks(scheduler: SchedulerService, kernel: Kernel): void {
  // Memory consolidation — dedup identical entries
  scheduler.register("memory-consolidation", 1800000, async () => {
    const memory = kernel.get<{ isEnabled: () => boolean; list: () => Array<{ id: string; category: string; key: string; value: string }>; delete: (id: string) => void }>("memory");
    if (!memory.isEnabled()) return;
    const entries = memory.list();
    const seen = new Map<string, string>();
    for (const entry of entries) {
      const key = `${entry.category}:${entry.key}`;
      if (seen.has(key) && seen.get(key) === entry.value) {
        memory.delete(entry.id);
      } else {
        seen.set(key, entry.value);
      }
    }
  });

  // Session cleanup — remove old sessions
  scheduler.register("session-cleanup", 3600000, async () => {
    const settings = kernel.get<{ get: (key: string) => unknown }>("settings");
    const retentionDays = (settings.get("scheduler.session_retention_days") as number) ?? 30;
    const db = kernel.get<import("bun:sqlite").Database>("db");
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    db.query("DELETE FROM chat_sessions WHERE updated_at < ?").run(cutoff);
  });

  // Index health check — invalidate all search indexes
  scheduler.register("index-check", 900000, async () => {
    const chat = kernel.get<{ invalidateIndexes: () => void }>("chat");
    const docs = kernel.get<{ invalidateIndex: () => void }>("docs");
    const wiki = kernel.get<{ invalidateIndex: () => void }>("wiki");
    chat.invalidateIndexes();
    docs.invalidateIndex();
    wiki.invalidateIndex();
  });

  // Auto-backup — export database to JSON files with rotation
  scheduler.register("auto-backup", 3600000, async () => {
    const settings = kernel.get<{ get: (key: string) => unknown }>("settings");
    if (settings.get("scheduler.auto_backup_enabled") === false) return;

    const db = kernel.get<import("bun:sqlite").Database>("db");
    const data = exportDatabase(db);
    const backupDir = join(process.cwd(), "data", "backups");
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const filePath = join(backupDir, filename);
    writeFileSync(filePath, JSON.stringify(data, null, 2));

    // Cleanup old backups beyond retention limit
    const retention = (settings.get("scheduler.backup_retention") as number) ?? 7;
    const files = readdirSync(backupDir)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".json"))
      .sort()
      .reverse();

    for (const file of files.slice(retention)) {
      unlinkSync(join(backupDir, file));
    }
  });
}
