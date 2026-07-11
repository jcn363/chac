import { Database } from "bun:sqlite";
import { runMigrations } from "../../src/database/migrations";
import { SettingsService } from "../../src/modules/settings/service";
import { DocumentsService } from "../../src/modules/documents/service";
import { ChatService } from "../../src/modules/chat/service";
import { WikiService } from "../../src/modules/wiki/service";
import { MemoryService } from "../../src/modules/memory/service";
import { createMockLlmService } from "../mocks/llama-cpp";
import { createKernel } from "../../src/kernel";
import type { Kernel } from "../../src/kernel/types";

export function createTestKernel(): Kernel {
  const kernel = createKernel();
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  kernel.provide("db", db);
  kernel.provide("settings", new SettingsService(db));
  kernel.provide("llm", createMockLlmService());
  kernel.provide("docs", new DocumentsService(kernel));
  kernel.provide("chat", new ChatService(kernel));
  kernel.provide("wiki", new WikiService(kernel));
  kernel.provide("memory", new MemoryService(kernel));
  return kernel;
}
