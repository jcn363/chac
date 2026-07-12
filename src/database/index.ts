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

      for (const row of rows) {
        const rowRecord = row as Record<string, unknown>;
        const values = columns.map((col) => rowRecord[col] ?? null) as [null];
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
