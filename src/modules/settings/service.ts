import type { Database } from "bun:sqlite";
import { DEFAULT_SETTINGS, type SettingRow } from "./types";

/** DB-backed settings with in-memory cache and JSON parsing. */
export class SettingsService {
  private db: Database;
  private cache = new Map<string, unknown>();

  constructor(db: Database) {
    this.db = db;
    this.ensureDefaults();
    this.loadCache();
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

  private loadCache(): void {
    const rows = this.db.query("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
    for (const row of rows) {
      try {
        this.cache.set(row.key, JSON.parse(row.value));
      } catch {
        this.cache.set(row.key, row.value);
      }
    }
  }

  get(key: string): unknown {
    if (this.cache.has(key)) return this.cache.get(key);
    const row = this.db
      .query("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    if (!row) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch {
      parsed = row.value;
    }
    this.cache.set(key, parsed);
    return parsed;
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
    this.cache.set(key, value);
  }

  getAll(): SettingRow[] {
    return this.db.query("SELECT * FROM settings ORDER BY category, key").all() as SettingRow[];
  }
}
