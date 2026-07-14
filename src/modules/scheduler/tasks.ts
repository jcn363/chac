import type { Kernel } from "../../kernel/types";
import type { SchedulerService } from "./service";
import type { SettingsServiceType } from "../settings/types";
import { exportDatabase } from "../../database";
import { join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile, readdir, unlink } from "node:fs/promises";

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
    // Cap total entries
    const settings = kernel.get<SettingsServiceType>("settings");
    const db = kernel.get<import("bun:sqlite").Database>("db");
    const maxEntries = (settings.get("memory.max_entries") as number) || 500;
    const count = db.query("SELECT COUNT(*) as count FROM user_memory").get() as { count: number };
    if (count.count > maxEntries) {
      db.query(`DELETE FROM user_memory WHERE id IN (SELECT id FROM user_memory ORDER BY created_at ASC LIMIT ?)`).run(count.count - maxEntries);
    }
  });

  // Session cleanup — remove old sessions
  scheduler.register("session-cleanup", 3600000, async () => {
    const settings = kernel.get<SettingsServiceType>("settings");
    const retentionDays = (settings.get("scheduler.session_retention_days") as number) ?? 30;
    const db = kernel.get<import("bun:sqlite").Database>("db");
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    db.query("DELETE FROM chat_sessions WHERE updated_at < ?").run(cutoff);
  });

  // Search history cleanup — remove old search records
  scheduler.register("search-history-cleanup", 24 * 60 * 60 * 1000, async () => {
    const settings = kernel.get<SettingsServiceType>("settings");
    const retentionDays = (settings.get("scheduler.search_history_retention_days") as number) || 30;
    const db = kernel.get<import("bun:sqlite").Database>("db");
    const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
    db.query("DELETE FROM search_history WHERE created_at < ?").run(cutoff);
  });

  // Auto-backup — export database to JSON files with rotation
  scheduler.register("auto-backup", 3600000, async () => {
    const settings = kernel.get<SettingsServiceType>("settings");
    if (settings.get("scheduler.auto_backup_enabled") === false) return;

    const db = kernel.get<import("bun:sqlite").Database>("db");
    const data = exportDatabase(db);
    const backupDir = join(process.cwd(), "data", "backups");
    if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });

    const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    const filePath = join(backupDir, filename);
    await writeFile(filePath, JSON.stringify(data, null, 2));

    // Cleanup old backups beyond retention limit
    const retention = (settings.get("scheduler.backup_retention") as number) ?? 7;
    const files = (await readdir(backupDir))
      .filter((f) => f.startsWith("backup-") && f.endsWith(".json"))
      .sort()
      .reverse();

    for (const file of files.slice(retention)) {
      await unlink(join(backupDir, file));
    }
  });
}
