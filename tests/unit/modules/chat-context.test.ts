import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createTestKernel } from "../../helpers/setup";
import { ChatService } from "../../../src/modules/chat/service";
import { SettingsService } from "../../../src/modules/settings/service";
import { runMigrations } from "../../../src/database/migrations";
import { embeddingToBlob } from "../../../src/utils/vector";
import { generateId } from "../../../src/utils/id";
import type { Kernel } from "../../../src/kernel/types";

let db: Database;
let kernel: Kernel;
let chat: ChatService;

function seedWikiPage(content: string) {
  const id = generateId();
  const emb = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
  db.query(
    "INSERT INTO wiki_pages (id, title, slug, content, content_hash, embedding, source_document_ids) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(id, "Test Wiki", "test-wiki", content, "hash1", embeddingToBlob(emb), "[]");
  return id;
}

function seedChunk(content: string, docId?: string) {
  const id = generateId();
  const did = docId ?? generateId();
  const emb = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
  // Ensure doc exists
  db.query(
    "INSERT OR IGNORE INTO documents (id, title, source_path, content_hash, mime_type, file_size, chunk_count) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(did, "Doc", "test.txt", `hash-${did}`, "text/plain", 100, 1);
  db.query(
    "INSERT INTO chunks (id, document_id, chunk_index, content, token_count, embedding, embedding_model, embedding_dimensions) " +
      "VALUES (?, ?, 0, ?, 10, ?, 'local', 768)"
  ).run(id, did, content, embeddingToBlob(emb));
  return id;
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  kernel = createTestKernel();
  kernel.provide("db", db);
  kernel.provide("settings", new SettingsService(db));
  chat = new ChatService(kernel);
});

afterEach(() => {
  db.close();
});

describe("Chat context retrieval", () => {
  it("searches wiki pages when embeddings exist", async () => {
    seedWikiPage("Wiki page about neural networks and deep learning.");
    const session = chat.createSession({ title: "Test" });
    const msg = await chat.sendMessage(session.id, "Tell me about neural networks");
    expect(msg.content).toContain("Mock response");
    expect(msg.role).toBe("assistant");
  });

  it("falls back to chunks when no wiki pages exist", async () => {
    seedChunk("A chunk about machine learning algorithms and models.");
    const session = chat.createSession({ title: "Test" });
    const msg = await chat.sendMessage(session.id, "What is machine learning?");
    expect(msg.content).toContain("Mock response");
  });

  it("handles empty DB gracefully", async () => {
    const session = chat.createSession({ title: "Test" });
    const msg = await chat.sendMessage(session.id, "Hello");
    expect(msg.content).toContain("Mock response");
  });

  it("includes context chunks in assistant response metadata", async () => {
    seedChunk("Important fact about the solar system.");
    const session = chat.createSession({ title: "Test" });
    const msg = await chat.sendMessage(session.id, "Tell me about space");
    // context_chunks should be a JSON array string
    expect(msg.context_chunks).toBeDefined();
  });
});
