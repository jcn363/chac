import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

interface Migration {
  version: number;
  up: string;
}

const SCHEMA_SQL = readFileSync(
  join(import.meta.dir, "schema.sql"),
  "utf-8"
);

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: SCHEMA_SQL,
  },
];

function ensureMetaTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const row = db
    .query("SELECT value FROM schema_meta WHERE key = 'version'")
    .get() as { value: string } | undefined;

  if (!row) {
    db.query("INSERT INTO schema_meta (key, value) VALUES ('version', '0')").run();
  }
}

function getCurrentVersion(db: Database): number {
  const row = db
    .query("SELECT value FROM schema_meta WHERE key = 'version'")
    .get() as { value: string };
  return parseInt(row.value, 10);
}

export function runMigrations(db: Database): void {
  ensureMetaTable(db);
  const current = getCurrentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > current);

  if (pending.length === 0) return;

  const applyAll = db.transaction((migrations: Migration[]) => {
    for (const migration of migrations) {
      db.exec(migration.up);
      db.query("UPDATE schema_meta SET value = ? WHERE key = 'version'")
        .run(String(migration.version));
    }
  });

  applyAll(pending);
}
