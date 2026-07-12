import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../../src/database/migrations";
import {
  deleteById,
  countRows,
  parsePagination,
  extractErrorMessage,
} from "../../../src/utils/db-helpers";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
});

describe("deleteById", () => {
  it("deletes an existing row and returns true", () => {
    db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run("d1", "Doc", "hash", 0);
    expect(deleteById(db, "documents", "d1")).toBe(true);
    expect(db.query("SELECT COUNT(*) as count FROM documents").get() as { count: number }).count;
  });

  it("returns false when id does not exist", () => {
    expect(deleteById(db, "documents", "nonexistent")).toBe(false);
  });

  it("does not affect other rows", () => {
    db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run("d1", "Doc 1", "h1", 0);
    db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run("d2", "Doc 2", "h2", 0);
    deleteById(db, "documents", "d1");
    expect(countRows(db, "documents")).toBe(1);
  });
});

describe("countRows", () => {
  it("returns 0 for empty table", () => {
    expect(countRows(db, "documents")).toBe(0);
  });

  it("counts all rows", () => {
    db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run("d1", "A", "h1", 0);
    db.query("INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)").run("d2", "B", "h2", 0);
    expect(countRows(db, "documents")).toBe(2);
  });
});

describe("parsePagination", () => {
  it("defaults to page 1, perPage 20", () => {
    expect(parsePagination({})).toEqual({ page: 1, perPage: 20, offset: 0 });
  });

  it("calculates offset correctly", () => {
    expect(parsePagination({ page: 3, perPage: 10 })).toEqual({ page: 3, perPage: 10, offset: 20 });
  });

  it("handles page 1 with custom perPage", () => {
    expect(parsePagination({ perPage: 50 })).toEqual({ page: 1, perPage: 50, offset: 0 });
  });

  it("handles undefined values", () => {
    expect(parsePagination({ page: undefined, perPage: undefined })).toEqual({ page: 1, perPage: 20, offset: 0 });
  });
});

describe("extractErrorMessage", () => {
  it("extracts message from Error", () => {
    expect(extractErrorMessage(new Error("test error"))).toBe("test error");
  });

  it("returns 'Unknown error' for non-Error values", () => {
    expect(extractErrorMessage("string error")).toBe("Unknown error");
    expect(extractErrorMessage(null)).toBe("Unknown error");
    expect(extractErrorMessage(undefined)).toBe("Unknown error");
    expect(extractErrorMessage(42)).toBe("Unknown error");
  });

  it("handles Error with empty message", () => {
    expect(extractErrorMessage(new Error(""))).toBe("");
  });
});
