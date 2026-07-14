import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import {
  formatCitation,
  generateCitation,
} from "../../../src/utils/citations";

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'text',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    );
  `);
  return db;
}

describe("citations", () => {
  describe("formatCitation", () => {
    it("returns a formatted string with title and preview", () => {
      const result = formatCitation("My Document", "This is the content.");
      expect(result).toBe('Source: "My Document" — "This is the content...."');
    });

    it("truncates content to 100 characters", () => {
      const longContent = "A".repeat(200);
      const result = formatCitation("Title", longContent);
      expect(result).toContain("A".repeat(100));
      expect(result).not.toContain("A".repeat(101));
    });

    it("replaces newlines in preview", () => {
      const content = "Line one\nLine two\nLine three";
      const result = formatCitation("Title", content);
      expect(result).toContain("Line one Line two Line three");
      expect(result).not.toContain("\n");
    });

    it("handles empty content", () => {
      const result = formatCitation("Title", "");
      expect(result).toBe('Source: "Title" — "..."');
    });

    it("handles empty title", () => {
      const result = formatCitation("", "Some content");
      expect(result).toBe('Source: "" — "Some content..."');
    });

    it("handles both empty title and content", () => {
      const result = formatCitation("", "");
      expect(result).toBe('Source: "" — "..."');
    });
  });

  describe("generateCitation", () => {
    it("returns citation with document title when chunk exists", () => {
      const db = createTestDb();
      db.query("INSERT INTO documents (id, title, content) VALUES (?, ?, ?)").run("doc1", "Test Doc", "body");
      db.query("INSERT INTO chunks (id, document_id, content, chunk_index) VALUES (?, ?, ?, ?)").run("chunk1", "doc1", "Hello world", 0);

      const result = generateCitation(db, "chunk1", "Hello world content");
      expect(result.documentTitle).toBe("Test Doc");
      expect(result.citation).toContain("Test Doc");
      expect(result.citation).toContain("Hello world content");
    });

    it("returns empty strings when chunk does not exist", () => {
      const db = createTestDb();
      const result = generateCitation(db, "nonexistent", "Some content");
      expect(result.citation).toBe("");
      expect(result.documentTitle).toBe("");
    });

    it("returns empty strings for empty database", () => {
      const db = createTestDb();
      const result = generateCitation(db, "chunk1", "content");
      expect(result.citation).toBe("");
      expect(result.documentTitle).toBe("");
    });

    it("returns formatted citation matching formatCitation output", () => {
      const db = createTestDb();
      db.query("INSERT INTO documents (id, title, content) VALUES (?, ?, ?)").run("doc1", "My Doc", "body");
      db.query("INSERT INTO chunks (id, document_id, content, chunk_index) VALUES (?, ?, ?, ?)").run("chunk1", "doc1", "text", 0);

      const content = "Some preview text here";
      const result = generateCitation(db, "chunk1", content);
      expect(result.citation).toBe(formatCitation("My Doc", content));
    });
  });
});
