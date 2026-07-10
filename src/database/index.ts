import { Database } from "bun:sqlite";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
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
