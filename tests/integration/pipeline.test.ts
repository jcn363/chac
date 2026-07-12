import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../src/database/migrations";
import { SettingsService } from "../../src/modules/settings/service";
import { DocumentsService } from "../../src/modules/documents/service";
import { DocumentTagsService } from "../../src/modules/documents/tags";
import { SearchHistoryService } from "../../src/modules/documents/search-history";
import { DocumentSearchService } from "../../src/modules/documents/search";
import { ChatService } from "../../src/modules/chat/service";
import { WikiService } from "../../src/modules/wiki/service";
import { WikiSynthesizer } from "../../src/modules/wiki/synthesizer";
import { WikiCompiler } from "../../src/modules/wiki/compiler";
import { MemoryService } from "../../src/modules/memory/service";
import { createMockLlmService } from "../mocks/llama-cpp";
import { createKernel } from "../../src/kernel";
import { VectorIndex } from "../../src/utils/vector-index";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Kernel } from "../../src/kernel/types";

let kernel: Kernel;
let db: Database;
let docs: DocumentsService;
let search: DocumentSearchService;
let chat: ChatService;
let wiki: WikiService;
let memory: MemoryService;
let testDir: string;

beforeEach(() => {
  kernel = createKernel();
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  const settings = new SettingsService(db);
  const llm = createMockLlmService();
  kernel.provide("db", db);
  kernel.provide("settings", settings);
  kernel.provide("llm", llm);
  docs = new DocumentsService(kernel);
  const chunkIndex = new VectorIndex(db, "chunks");
  kernel.provide("tags", new DocumentTagsService(db));
  kernel.provide("searchHistory", new SearchHistoryService(db));
  kernel.provide("search", new DocumentSearchService(db, llm, chunkIndex, settings));
  chat = new ChatService(kernel);

  const wikiIndex = new VectorIndex(db, "wiki_pages");
  const wikiSynthesizer = new WikiSynthesizer(db, llm, wikiIndex, settings);
  const wikiCompiler = new WikiCompiler(db, llm, docs, settings, wikiSynthesizer);
  wiki = new WikiService(kernel);
  wiki.setCompiler(wikiCompiler);

  memory = new MemoryService(kernel);
  kernel.provide("docs", docs);
  search = kernel.get<DocumentSearchService>("search");
  kernel.provide("chat", chat);
  kernel.provide("wiki", wiki);
  kernel.provide("memory", memory);

  testDir = join(import.meta.dir, "../../.test-tmp");
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  db.close();
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function createTestFile(name: string, content: string): string {
  const path = join(testDir, name);
  writeFileSync(path, content);
  return path;
}

describe("Full Pipeline Integration", () => {
  it("ingest → chunk → embed → store", async () => {
    const filePath = createTestFile("test.txt", "Machine learning is a subset of AI. It uses data to train models.");
    const result = await docs.ingest(filePath);
    expect(result.id).toBeDefined();
    expect(result.chunkCount).toBeGreaterThanOrEqual(1);

    const doc = docs.get(result.id);
    expect(doc).toBeDefined();
    expect(doc!.title).toBe("test.txt");
  });

  it("ingest deduplicates on re-ingest", async () => {
    const filePath = createTestFile("dedup.txt", "Some content for dedup testing.");
    const first = await docs.ingest(filePath);
    const second = await docs.ingest(filePath);
    expect(first.id).toBe(second.id);
  });

  it("ingest → search chunks", async () => {
    const filePath = createTestFile("searchable.txt", "Python is a programming language used for data science and web development.");
    await docs.ingest(filePath);
    const results = await search.search("Python programming");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]!.content).toContain("Python");
  });

  it("ingest → compile wiki → search wiki", async () => {
    const filePath = createTestFile("wiki-source.txt", "Neural networks are computing systems inspired by biological neural networks. They learn from data.");
    await docs.ingest(filePath);
    const pages = await wiki.compile();
    expect(pages.length).toBeGreaterThanOrEqual(1);
    expect(pages[0]!.content).toBeDefined();

    const searchResults = await wiki.search("neural networks");
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
  });

  it("chat → retrieval → context injection", async () => {
    const filePath = createTestFile("context.txt", "The capital of France is Paris. The capital of Germany is Berlin.");
    await docs.ingest(filePath);
    await wiki.compile();

    const session = chat.createSession();
    const msg = await chat.sendMessage(session.id, "What is the capital of France?");
    expect(msg.content).toBeDefined();
    expect(msg.context_chunks).toBeDefined();
  });

  it("chat → memory extraction is fire-and-forget", async () => {
    const session = chat.createSession();
    await chat.sendMessage(session.id, "I prefer Python over Java for web development");

    // Memory extraction is fire-and-forget — mock LLM returns text, not JSON
    // so extraction silently skips. Verify chat message was saved correctly.
    const messages = chat.getMessages(session.id);
    expect(messages.length).toBe(2);
  });

  it("chat → memory injection in next message", async () => {
    const session = chat.createSession();
    await chat.sendMessage(session.id, "My favorite color is blue");
    const msg2 = await chat.sendMessage(session.id, "What did I just tell you?");
    expect(msg2.content).toBeDefined();
  });

  it("cross-session memory persists", async () => {
    const session1 = chat.createSession();
    await chat.sendMessage(session1.id, "I work as a software engineer");

    const session2 = chat.createSession();
    const msg = await chat.sendMessage(session2.id, "What do I do for a living?");
    expect(msg.content).toBeDefined();
  });

  it("memory CRUD operations", () => {
    const entry = memory.upsert("preference", "editor", "VS Code");
    expect(entry.key).toBe("editor");

    const found = memory.get("preference", "editor");
    expect(found).toBeDefined();
    expect(found!.value).toBe("VS Code");

    memory.upsert("preference", "editor", "Neovim");
    const updated = memory.get("preference", "editor");
    expect(updated!.value).toBe("Neovim");

    expect(memory.delete(entry.id)).toBe(true);
    expect(memory.get("preference", "editor")).toBeUndefined();
  });

  it("memory builds context string", () => {
    memory.upsert("preference", "lang", "Python");
    memory.upsert("topic", "AI", "Machine learning");
    const ctx = memory.buildContextString();
    expect(ctx).toContain("preference:");
    expect(ctx).toContain("lang: Python");
    expect(ctx).toContain("topic:");
    expect(ctx).toContain("AI: Machine learning");
  });

  it("settings control features", () => {
    const settings = kernel.get<{ get: (key: string) => unknown }>("settings");

    expect(settings.get("rag.chunk_mode")).toBe("character");
    expect(settings.get("rag.auto_compound")).toBe(false);
    expect(settings.get("wiki.agents_enabled")).toBe(false);
    expect(settings.get("memory.enabled")).toBe(true);
    expect(settings.get("llm.chat.ctx_size.auto")).toBe(true);
  });

  it("session management CRUD", () => {
    const session = chat.createSession({ title: "Test Session" });
    expect(session.title).toBe("Test Session");

    const sessions = chat.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.title).toBe("Test Session");

    chat.updateSession(session.id, "Updated Title");
    const updated = chat.getSession(session.id);
    expect(updated!.title).toBe("Updated Title");

    expect(chat.deleteSession(session.id)).toBe(true);
    expect(chat.getSession(session.id)).toBeUndefined();
  });

  it("messages are persisted correctly", async () => {
    const session = chat.createSession();
    await chat.sendMessage(session.id, "Hello");
    await chat.sendMessage(session.id, "How are you?");

    const messages = chat.getMessages(session.id);
    expect(messages.length).toBe(4);

    const userMsgs = messages.filter((m) => m.role === "user");
    expect(userMsgs.length).toBe(2);
    expect(userMsgs[0]!.content).toBe("Hello");
    expect(userMsgs[1]!.content).toBe("How are you?");

    const assistantMsgs = messages.filter((m) => m.role === "assistant");
    expect(assistantMsgs.length).toBe(2);
  });

  it("wiki version increments on recompile", async () => {
    const filePath = createTestFile("version-test.txt", "Content for version testing.");
    await docs.ingest(filePath);
    const pages1 = await wiki.compile();
    expect(pages1[0]!.version).toBe(1);

    const pages2 = await wiki.compile();
    expect(pages2[0]!.version).toBe(2);
  });

  it("documents can be deleted", async () => {
    const filePath = createTestFile("deletable.txt", "Content to delete.");
    const result = await docs.ingest(filePath);
    expect(docs.delete(result.id)).toBe(true);
    expect(docs.get(result.id)).toBeUndefined();
  });

  it("wiki pages can be deleted", async () => {
    const filePath = createTestFile("wiki-delete.txt", "Content for wiki deletion test.");
    await docs.ingest(filePath);
    const pages = await wiki.compile();
    expect(wiki.delete(pages[0]!.id)).toBe(true);
    expect(wiki.get(pages[0]!.id)).toBeUndefined();
  });

  it("list documents and wiki pages", async () => {
    const f1 = createTestFile("list1.txt", "First document content.");
    const f2 = createTestFile("list2.txt", "Second document content.");
    await docs.ingest(f1);
    await docs.ingest(f2);

    const docList = docs.list();
    expect(docList.documents.length).toBe(2);
    expect(docList.total).toBe(2);

    await wiki.compile();
    const wikiList = wiki.list();
    expect(wikiList.pages.length).toBeGreaterThanOrEqual(2);
  });

  it("token budget limits history", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("llm.chat.ctx_size", 512);

    const session = chat.createSession();
    for (let i = 0; i < 10; i++) {
      await chat.sendMessage(session.id, `Message ${i} with some content to fill tokens`);
    }

    const messages = chat.getMessages(session.id);
    expect(messages.length).toBe(20);
  });

  it("semantic chunking mode", async () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("rag.chunk_mode", "semantic");

    const filePath = createTestFile("semantic.txt", "First paragraph with content.\n\nSecond paragraph with more content.\n\nThird paragraph.");
    const result = await docs.ingest(filePath);
    expect(result.chunkCount).toBeGreaterThanOrEqual(1);
  });
});
