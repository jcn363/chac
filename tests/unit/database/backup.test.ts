import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { exportDatabase, importDatabase, type BackupData } from "../../../src/database";
import type { Kernel } from "../../../src/kernel/types";
import type { Database } from "bun:sqlite";

describe("Backup/Restore", () => {
  let kernel: Kernel;
  let db: Database;

  beforeEach(() => {
    kernel = createTestKernel();
    db = kernel.get<Database>("db");
  });

  afterEach(() => {
    db.close();
  });

  it("exports empty database", () => {
    const data = exportDatabase(db);
    expect(data.version).toBe("1.0.0");
    expect(data.timestamp).toBeDefined();
    expect(data.tables).toBeDefined();
    expect(Object.keys(data.tables).length).toBeGreaterThan(0);
  });

  it("exports database with data", () => {
    const chat = kernel.get<{ createSession: (opts: { title: string }) => { id: string } }>("chat");
    chat.createSession({ title: "Test Session" });

    const data = exportDatabase(db);
    const sessions = data.tables.chat_sessions as Record<string, unknown>[];
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.title).toBe("Test Session");
  });

  it("import restores data", () => {
    const backup: BackupData = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      tables: {
        chat_sessions: [
          {
            id: "test-id",
            title: "Imported Session",
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

    importDatabase(backup, db);

    const chat = kernel.get<{ listSessions: () => { id: string; title: string }[] }>("chat");
    const sessions = chat.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.title).toBe("Imported Session");
  });

  it("import clears existing data", () => {
    const chat = kernel.get<{ createSession: (opts: { title: string }) => { id: string }; listSessions: () => any[] }>("chat");
    chat.createSession({ title: "Existing" });

    const backup: BackupData = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      tables: {
        chat_sessions: [
          {
            id: "new-id",
            title: "New Session",
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

    importDatabase(backup, db);

    const sessions = chat.listSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].title).toBe("New Session");
  });

  it("round-trip export then import", () => {
    const chat = kernel.get<{ createSession: (opts: { title: string }) => { id: string }; listSessions: () => any[] }>("chat");
    chat.createSession({ title: "Round Trip" });

    const exported = exportDatabase(db);
    const sessions = chat.listSessions();
    expect(sessions.length).toBe(1);

    importDatabase(exported, db);
    const sessionsAfter = chat.listSessions();
    expect(sessionsAfter.length).toBe(1);
    expect(sessionsAfter[0].title).toBe("Round Trip");
  });
});
