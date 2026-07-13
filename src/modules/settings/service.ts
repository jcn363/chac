import type { Database } from "bun:sqlite";
import { DEFAULT_SETTINGS, SETTING_VALIDATORS, type SettingRow } from "./types";
import { createLogger } from "../../utils/logger";

const log = createLogger("settings");

type SettingsChangeHandler = (key: string, value: unknown) => void;

/** DB-backed settings with in-memory cache and JSON parsing. */
export class SettingsService {
  private db: Database;
  private cache = new Map<string, unknown>();
  private changeHandlers: SettingsChangeHandler[] = [];

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
    log.info(`${count} defaults loaded`);
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

  set(key: string, value: unknown): { success: boolean; error?: string } {
    if (value !== null) {
      const validator = SETTING_VALIDATORS[key];
      if (validator) {
        if (typeof value !== validator.type) {
          return { success: false, error: `Expected ${validator.type}, got ${typeof value}` };
        }
        if (validator.type === 'number') {
          if (validator.min !== undefined && (value as number) < validator.min) {
            return { success: false, error: `Minimum value is ${validator.min}` };
          }
          if (validator.max !== undefined && (value as number) > validator.max) {
            return { success: false, error: `Maximum value is ${validator.max}` };
          }
        }
        if (validator.enum && !validator.enum.includes(value as string)) {
          return { success: false, error: `Must be one of: ${validator.enum.join(', ')}` };
        }
      }
    }
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
    for (const handler of this.changeHandlers) {
      try {
        handler(key, value);
      } catch (e) {
        log.error("Settings change handler error", { error: String(e) });
      }
    }
    return { success: true };
  }

  onChange(handler: SettingsChangeHandler): void {
    this.changeHandlers.push(handler);
  }

  getAll(): SettingRow[] {
    return this.db.query("SELECT * FROM settings ORDER BY category, key").all() as SettingRow[];
  }
}
