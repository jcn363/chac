import type { Database } from "bun:sqlite";
import { DEFAULT_SETTINGS, type SettingRow } from "./types";

export class SettingsService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.ensureDefaults();
  }

  private ensureDefaults(): void {
    const insert = this.db.query(
      "INSERT OR IGNORE INTO settings (key, value, category, description) VALUES (?, ?, ?, ?)"
    );
    for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
      insert.run(key, JSON.stringify(def.value), def.category, def.description);
    }
    const count = (this.db.query("SELECT COUNT(*) as c FROM settings").get() as { c: number }).c;
    console.log(`Settings: ${count} defaults loaded`);
  }

  get(key: string): unknown {
    const row = this.db
      .query("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : undefined;
  }

  set(key: string, value: unknown): void {
    const jsonValue = JSON.stringify(value);
    const result = this.db
      .query("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = ?")
      .run(jsonValue, key);
    if (result.changes === 0) {
      this.db
        .query("INSERT INTO settings (key, value, category, updated_at) VALUES (?, ?, 'general', datetime('now'))")
        .run(key, jsonValue);
    }
  }

  getAll(): SettingRow[] {
    return this.db.query("SELECT * FROM settings ORDER BY category, key").all() as SettingRow[];
  }

  getCategory(category: string): SettingRow[] {
    return this.db
      .query("SELECT * FROM settings WHERE category = ? ORDER BY key")
      .all(category) as SettingRow[];
  }
}
