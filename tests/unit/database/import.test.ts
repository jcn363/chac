import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../../src/database/migrations";
import { exportDatabase, importDatabase, type BackupData } from "../../../src/database";

describe("importDatabase", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  it("round-trip export and import preserves documents", () => {
    db.query(
      "INSERT INTO documents (id, title, source_path, source_type, content_hash) VALUES (?, ?, ?, ?, ?)"
    ).run("doc1", "Test Document", "/path/to/file.txt", "file", "hash123");

    const exported = exportDatabase(db);

    const freshDb = new Database(":memory:");
    freshDb.exec("PRAGMA foreign_keys = ON");
    runMigrations(freshDb);

    importDatabase(exported, freshDb);

    const row = freshDb.query("SELECT * FROM documents WHERE id = ?").get("doc1") as {
      title: string;
      source_path: string;
      source_type: string;
    };
    expect(row).toBeDefined();
    expect(row.title).toBe("Test Document");
    expect(row.source_path).toBe("/path/to/file.txt");
    expect(row.source_type).toBe("file");

    freshDb.close();
  });

  it("handles empty export gracefully", () => {
    const emptyExport: BackupData = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      tables: {},
    };
    importDatabase(emptyExport, db);
  });

  it("handles tables with empty arrays", () => {
    const emptyTablesExport: BackupData = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      tables: {
        documents: [],
        chunks: [],
        chat_sessions: [],
        chat_messages: [],
        wiki_pages: [],
        settings: [],
        document_tags: [],
        usage_log: [],
        user_memory: [],
      },
    };
    importDatabase(emptyTablesExport, db);
  });

  it("preserves settings across export/import", () => {
    db.query(
      "INSERT INTO settings (key, value, category) VALUES (?, ?, ?)"
    ).run("test.setting", '"hello world"', "test");

    const exported = exportDatabase(db);

    const freshDb = new Database(":memory:");
    freshDb.exec("PRAGMA foreign_keys = ON");
    runMigrations(freshDb);
    importDatabase(exported, freshDb);

    const row = freshDb.query("SELECT * FROM settings WHERE key = ?").get("test.setting") as {
      value: string;
      category: string;
    };
    expect(row).toBeDefined();
    expect(row.value).toBe('"hello world"');
    expect(row.category).toBe("test");

    freshDb.close();
  });

  it("import clears existing data before inserting", () => {
    db.query(
      "INSERT INTO documents (id, title, source_path, source_type) VALUES (?, ?, ?, ?)"
    ).run("old-doc", "Old Document", "/old/path", "file");

    const newExport: BackupData = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      tables: {
        documents: [
          {
            id: "new-doc",
            title: "New Document",
            source_path: "/new/path",
            source_type: "file",
            content_hash: null,
            mime_type: null,
            file_size: null,
            chunk_count: 0,
            metadata: null,
            description: null,
            transcription: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        chunks: [],
        chat_sessions: [],
        chat_messages: [],
        wiki_pages: [],
        settings: [],
        document_tags: [],
        usage_log: [],
        user_memory: [],
      },
    };

    importDatabase(newExport, db);

    const allDocs = db.query("SELECT * FROM documents").all();
    expect(allDocs.length).toBe(1);
    const doc = allDocs[0] as { id: string; title: string };
    expect(doc.id).toBe("new-doc");
    expect(doc.title).toBe("New Document");
  });

  it("preserves document tags across export/import", () => {
    db.query(
      "INSERT INTO documents (id, title, source_path, source_type) VALUES (?, ?, ?, ?)"
    ).run("doc1", "Tagged Doc", "/path", "file");
    db.query(
      "INSERT INTO document_tags (document_id, tag) VALUES (?, ?)"
    ).run("doc1", "important");
    db.query(
      "INSERT INTO document_tags (document_id, tag) VALUES (?, ?)"
    ).run("doc1", "reference");

    const exported = exportDatabase(db);

    const freshDb = new Database(":memory:");
    freshDb.exec("PRAGMA foreign_keys = ON");
    runMigrations(freshDb);
    importDatabase(exported, freshDb);

    const tags = freshDb
      .query("SELECT tag FROM document_tags WHERE document_id = ? ORDER BY tag")
      .all("doc1") as { tag: string }[];
    expect(tags.length).toBe(2);
    expect(tags[0]!.tag).toBe("important");
    expect(tags[1]!.tag).toBe("reference");

    freshDb.close();
  });

  it("preserves user_memory across export/import", () => {
    db.query(
      "INSERT INTO user_memory (id, category, key, value, source) VALUES (?, ?, ?, ?, ?)"
    ).run("mem1", "preference", "lang", "en", "chat");

    const exported = exportDatabase(db);

    const freshDb = new Database(":memory:");
    freshDb.exec("PRAGMA foreign_keys = ON");
    runMigrations(freshDb);
    importDatabase(exported, freshDb);

    const row = freshDb.query("SELECT * FROM user_memory WHERE id = ?").get("mem1") as {
      category: string;
      key: string;
      value: string;
      source: string;
    };
    expect(row).toBeDefined();
    expect(row.category).toBe("preference");
    expect(row.key).toBe("lang");
    expect(row.value).toBe("en");
    expect(row.source).toBe("chat");

    freshDb.close();
  });

  it("export version is 1.0.0", () => {
    const exported = exportDatabase(db);
    expect(exported.version).toBe("1.0.0");
    expect(exported.timestamp).toBeDefined();
  });
});
