import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../src/database/migrations";
import { VectorIndex } from "../../src/utils/vector-index";
import { embeddingToBlob } from "../../src/utils/vector";
import { createMockLlmService } from "../mocks/llama-cpp";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
});

afterEach(() => {
  db.close();
});

function seedEmbedding(table: string, id: string, content: string, emb: number[]): void {
  const blob = embeddingToBlob(emb);
  if (table === "chunks") {
    const docId = `doc-${id.split("-")[1] || "0"}`;
    const docExists = db.query("SELECT id FROM documents WHERE id = ?").get(docId);
    if (!docExists) {
      db.query("INSERT INTO documents (id, title, source_type) VALUES (?, ?, 'text')").run(docId, `Document ${docId}`);
    }
    db.query(`INSERT INTO ${table} (id, document_id, chunk_index, content, embedding) VALUES (?, ?, 0, ?, ?)`).run(id, docId, content, blob);
  } else {
    db.query(`INSERT INTO ${table} (id, content, embedding) VALUES (?, ?, ?)`).run(id, content, blob);
  }
}

describe("VectorIndex Persistence", () => {
  it("saves and loads index from DB cache", () => {
    const llm = createMockLlmService();

    // Seed 10 embeddings into chunks table
    for (let i = 0; i < 10; i++) {
      const emb = Array.from({ length: 768 }, (_, j) => (i * 768 + j) / 10000);
      seedEmbedding("chunks", `chunk-${i}`, `Content ${i}`, emb);
    }

    const index = new VectorIndex(db, "chunks");
    const queryVec = new Float32Array(768);
    for (let i = 0; i < 768; i++) queryVec[i] = i / 10000;

    // First search triggers rebuild + save
    const results1 = index.search(db, "chunks", "id", "content", queryVec, { limit: 3 });
    expect(results1.length).toBe(3);

    // Verify cache was populated
    const cacheCount = (db.query("SELECT COUNT(*) as c FROM vector_index_cache WHERE table_name = 'chunks'").get() as { c: number }).c;
    expect(cacheCount).toBe(10);

    // Invalidate and search again — should load from cache
    index.invalidate();
    const results2 = index.search(db, "chunks", "id", "content", queryVec, { limit: 3 });
    expect(results2.length).toBe(3);
    expect(results2[0]!.id).toBe(results1[0]!.id);
  });

  it("invalidation clears cache", () => {
    for (let i = 0; i < 5; i++) {
      const emb = Array.from({ length: 768 }, (_, j) => i * 768 + j);
      seedEmbedding("chunks", `chunk-${i}`, `Content ${i}`, emb);
    }

    const index = new VectorIndex(db, "chunks");
    const queryVec = new Float32Array(768);
    queryVec[0] = 1;

    index.search(db, "chunks", "id", "content", queryVec, { limit: 3 });

    // Cache should exist
    const before = (db.query("SELECT COUNT(*) as c FROM vector_index_cache WHERE table_name = 'chunks'").get() as { c: number }).c;
    expect(before).toBe(5);

    index.invalidate();

    // Cache should be cleared
    const after = (db.query("SELECT COUNT(*) as c FROM vector_index_cache WHERE table_name = 'chunks'").get() as { c: number }).c;
    expect(after).toBe(0);
  });

  it("gracefully handles missing cache table", () => {
    // Create a fresh DB without vector_index_cache table
    const freshDb = new Database(":memory:");
    freshDb.exec("PRAGMA foreign_keys = ON");
    freshDb.exec(`
      CREATE TABLE chunks (id TEXT PRIMARY KEY, content TEXT, embedding BLOB);
    `);

    const emb = Array.from({ length: 768 }, (_, j) => j);
    freshDb.query("INSERT INTO chunks (id, content, embedding) VALUES (?, ?, ?)").run("c1", "test", embeddingToBlob(emb));

    const index = new VectorIndex(freshDb, "chunks");
    const queryVec = new Float32Array(768);
    queryVec[0] = 1;

    // Should not throw — gracefully falls back to raw scan
    const results = index.search(freshDb, "chunks", "id", "content", queryVec, { limit: 3 });
    expect(results.length).toBe(1);
    expect(results[0]!.id).toBe("c1");

    freshDb.close();
  });

  it("works without persistence (no db/tableName)", () => {
    for (let i = 0; i < 5; i++) {
      const emb = Array.from({ length: 768 }, (_, j) => i * 768 + j);
      seedEmbedding("chunks", `chunk-${i}`, `Content ${i}`, emb);
    }

    const index = new VectorIndex(); // No persistence
    const queryVec = new Float32Array(768);
    queryVec[0] = 1;

    const results = index.search(db, "chunks", "id", "content", queryVec, { limit: 3 });
    expect(results.length).toBe(3);

    // Invalidate should not throw
    index.invalidate();

    // Should still work after invalidation
    const results2 = index.search(db, "chunks", "id", "content", queryVec, { limit: 3 });
    expect(results2.length).toBe(3);
  });
});
