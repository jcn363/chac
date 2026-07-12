import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { join } from "node:path";
import { rmSync, existsSync, mkdirSync } from "node:fs";
import { initDb, closeDb, exportDatabase, importDatabase } from "../../src/database";
import { createKernel } from "../../src/kernel";
import { SettingsService } from "../../src/modules/settings/service";
import { DocumentsService } from "../../src/modules/documents/service";
import { DocumentSearchService } from "../../src/modules/documents/search";
import { DocumentTagsService } from "../../src/modules/documents/tags";
import { SearchHistoryService } from "../../src/modules/documents/search-history";
import { ChatService } from "../../src/modules/chat/service";
import { WikiService } from "../../src/modules/wiki/service";
import { MemoryService } from "../../src/modules/memory/service";
import { SchedulerService } from "../../src/modules/scheduler/service";
import { VectorIndex } from "../../src/utils/vector-index";
import { createMockLlmService } from "../mocks/llama-cpp";
import { createRouter } from "../../src/modules/router";
import type { Kernel } from "../../src/kernel/types";
import type { Database } from "bun:sqlite";

let kernel: Kernel;
let app: ReturnType<typeof createRouter>;
let db: Database;

// initDb() creates data/chac.db in the project root
const projectRoot = join(import.meta.dir, "..", "..");
const dataDir = join(projectRoot, "data");

function req(path: string, init?: RequestInit) {
  return app.request(path, init);
}

function json(method: string, path: string, body: unknown) {
  return req(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  // Ensure data dir exists
  mkdirSync(dataDir, { recursive: true });

  // Initialize the global DB (creates data/chac.db)
  db = initDb();

  // Set up kernel with the global DB
  kernel = createKernel();
  kernel.provide("db", db);
  const settings = new SettingsService(db);
  kernel.provide("settings", settings);
  const llm = createMockLlmService();
  kernel.provide("llm", llm);
  const docs = new DocumentsService(kernel);
  kernel.provide("docs", docs);
  const chunkIndex = new VectorIndex(db, "chunks");
  kernel.provide("search", new DocumentSearchService(db, llm, chunkIndex, settings));
  kernel.provide("searchHistory", new SearchHistoryService(db));
  kernel.provide("tags", new DocumentTagsService(db));
  kernel.provide("chat", new ChatService(kernel));
  kernel.provide("wiki", new WikiService(kernel));
  kernel.provide("memory", new MemoryService(kernel));
  kernel.provide("scheduler", new SchedulerService(kernel));

  app = createRouter(kernel);
});

afterAll(() => {
  closeDb();
  // Clean up test DB file (but not the whole data dir if other tests use it)
  const dbFile = join(dataDir, "chac.db");
  const walFile = join(dataDir, "chac.db-wal");
  const shmFile = join(dataDir, "chac.db-shm");
  for (const f of [dbFile, walFile, shmFile]) {
    if (existsSync(f)) rmSync(f);
  }
});

describe("Backup/Restore integration", () => {
  it("GET /api/backup exports all tables from global DB", async () => {
    const res = await req("/api/backup");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.version).toBe("1.0.0");
    expect(data.tables).toBeDefined();

    const expectedTables = [
      "documents", "chunks", "chat_sessions", "chat_messages",
      "wiki_pages", "settings", "document_tags", "usage_log", "user_memory",
    ];
    for (const table of expectedTables) {
      expect(data.tables[table]).toBeDefined();
      expect(Array.isArray(data.tables[table])).toBe(true);
    }
  });

  it("POST /api/restore imports data into global DB", async () => {
    const backup = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      tables: {
        chat_sessions: [
          {
            id: "test-restore-session",
            title: "Restored Session",
            system_prompt: null,
            model: null,
            metadata: null,
            sort_order: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        chat_messages: [],
        documents: [],
        chunks: [],
        wiki_pages: [],
        settings: [],
        document_tags: [],
        usage_log: [],
        user_memory: [],
      },
    };

    const res = await json("POST", "/api/restore", backup);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.message).toBe("Database restored successfully");
  });

  it("round-trip: create session, export, restore, verify", async () => {
    // Create a session
    const createRes = await json("POST", "/api/chat/sessions", { title: "Round Trip Test" });
    const session = await createRes.json() as { id: string };

    // Export
    const backupRes = await req("/api/backup");
    const backup = await backupRes.json() as any;

    // Verify the session is in the export
    const sessions = backup.tables.chat_sessions as Array<{ id: string; title: string }>;
    const found = sessions.find((s) => s.id === session.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe("Round Trip Test");

    // Restore the backup
    const restoreRes = await json("POST", "/api/restore", backup);
    expect(restoreRes.status).toBe(200);

    // Verify session still exists after restore
    const listRes = await req("/api/chat/sessions");
    const allSessions = await listRes.json() as Array<{ id: string; title: string }>;
    const restored = allSessions.find((s) => s.id === session.id);
    expect(restored).toBeDefined();
  });

  it("export/import via direct functions works with global DB", () => {
    const exported = exportDatabase();
    expect(exported.tables).toBeDefined();

    // Clear and re-import
    importDatabase({ version: "1.0.0", timestamp: new Date().toISOString(), tables: {} }, db);

    // Re-import the exported data
    importDatabase(exported, db);

    const reExported = exportDatabase();
    expect(reExported.tables.chat_sessions).toBeDefined();
  });

  it("export captures settings from global DB", async () => {
    // Modify a setting
    const settings = kernel.get<SettingsService>("settings");
    settings.set("llm.chat.temperature", 0.9);

    const exported = exportDatabase();
    const settingsRows = exported.tables.settings as Array<{ key: string; value: string }>;
    const tempSetting = settingsRows.find((s) => s.key === "llm.chat.temperature");
    expect(tempSetting).toBeDefined();
    expect(JSON.parse(tempSetting!.value)).toBe(0.9);
  });

  it("restore overwrites existing data", async () => {
    // Create a session
    const createRes = await json("POST", "/api/chat/sessions", { title: "Before Restore" });
    const session = await createRes.json() as { id: string };

    // Create a backup that has a different session
    const backup = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      tables: {
        chat_sessions: [
          {
            id: "different-session",
            title: "After Restore",
            system_prompt: null,
            model: null,
            metadata: null,
            sort_order: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        chat_messages: [],
        documents: [],
        chunks: [],
        wiki_pages: [],
        settings: [],
        document_tags: [],
        usage_log: [],
        user_memory: [],
      },
    };

    // Restore — should replace existing sessions
    await json("POST", "/api/restore", backup);

    const listRes = await req("/api/chat/sessions");
    const sessions = await listRes.json() as Array<{ id: string; title: string }>;

    // Old session should be gone, new session should exist
    const oldSession = sessions.find((s) => s.id === session.id);
    const newSession = sessions.find((s) => s.id === "different-session");
    expect(oldSession).toBeUndefined();
    expect(newSession).toBeDefined();
    expect(newSession!.title).toBe("After Restore");
  });
});
