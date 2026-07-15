import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { getAppRoot } from "../platform/paths";
import { runMigrations } from "./migrations";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) throw new Error("Database not initialized. Call initDb() first.");
  return db;
}

export function initDb(): Database {
  const dataDir = join(getAppRoot(), "data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = join(dataDir, "chac.db");
  db = new Database(dbPath);

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");

  runMigrations(db);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.close();
    db = null;
  }
}

export interface BackupData {
  version: string;
  timestamp: string;
  tables: Record<string, unknown[]>;
}

export function exportDatabase(database?: Database): BackupData {
  const database_ = database ?? getDb();
  const tables = [
    "documents",
    "chunks",
    "chat_sessions",
    "chat_messages",
    "wiki_pages",
    "settings",
    "document_tags",
    "usage_log",
    "user_memory",
    "search_history",
    "vector_index_cache",
  ];

  const data: Record<string, unknown[]> = {};
  for (const table of tables) {
    try {
      data[table] = database_.query(`SELECT * FROM ${table}`).all();
    } catch {
      data[table] = [];
    }
  }

  return {
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    tables: data,
  };
}

/** Convert a JSON-deserialized BLOB (plain object with numeric keys) back to Uint8Array. */
function jsonBlobToUint8Array(val: unknown): Uint8Array | unknown {
  if (val === null || val === undefined) return val;
  if (val instanceof Uint8Array || val instanceof ArrayBuffer) return val;
  if (typeof val === "object" && !Array.isArray(val)) {
    const keys = Object.keys(val as Record<string, unknown>);
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      const obj = val as Record<string, number>;
      const arr = new Uint8Array(keys.length);
      for (let i = 0; i < keys.length; i++) arr[i] = obj[keys[i]!] ?? 0;
      return arr;
    }
  }
  return val;
}

export function importDatabase(data: BackupData, database?: Database): void {
  const database_ = database ?? getDb();

  const importAll = database_.transaction(() => {
    for (const [table, rows] of Object.entries(data.tables)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;

      database_.query(`DELETE FROM ${table}`).run();

      const firstRow = rows[0] as Record<string, unknown>;
      const columns = Object.keys(firstRow);
      const placeholders = columns.map(() => "?").join(", ");
      const insert = database_.query(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`
      );

      for (let ri = 0; ri < rows.length; ri++) {
        const rowRecord = rows[ri] as Record<string, unknown>;
        const values: unknown[] = columns.map((col) => jsonBlobToUint8Array(rowRecord[col] ?? null));
        insert.run(...values);
      }
    }
  });

  importAll();
}

export function exportToFile(filePath: string): void {
  const data = exportDatabase();
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function importFromFile(filePath: string): void {
  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as BackupData;
  importDatabase(data);
}
