import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../../src/database/migrations";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  db.close();
});

describe("runMigrations", () => {
  it("creates schema_meta table", () => {
    runMigrations(db);
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
    const names = tables.map((t: any) => t.name);
    expect(names).toContain("schema_meta");
  });

  it("creates all expected tables", () => {
    runMigrations(db);
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all();
    const names = tables.map((t: any) => t.name);
    expect(names).toContain("documents");
    expect(names).toContain("chunks");
    expect(names).toContain("chat_sessions");
    expect(names).toContain("chat_messages");
    expect(names).toContain("wiki_pages");
    expect(names).toContain("settings");
    expect(names).toContain("document_tags");
    expect(names).toContain("usage_log");
    expect(names).toContain("user_memory");
    expect(names).toContain("search_history");
    expect(names).toContain("vector_index_cache");
  });

  it("sets version to 6", () => {
    runMigrations(db);
    const row = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as { value: string };
    expect(row.value).toBe("6");
  });

  it("adds sort_order column to chat_sessions", () => {
    runMigrations(db);
    const cols = db.query("PRAGMA table_info(chat_sessions)").all() as { name: string }[];
    expect(cols.some((c) => c.name === "sort_order")).toBe(true);
  });

  it("adds citations column to chat_messages", () => {
    runMigrations(db);
    const cols = db.query("PRAGMA table_info(chat_messages)").all() as { name: string }[];
    expect(cols.some((c) => c.name === "citations")).toBe(true);
  });

  it("is idempotent", () => {
    runMigrations(db);
    runMigrations(db);
    const row = db.query("SELECT value FROM schema_meta WHERE key = 'version'").get() as { value: string };
    expect(row.value).toBe("6");
  });
});
