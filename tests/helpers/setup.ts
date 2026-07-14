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
import { SchedulerService } from "../../src/modules/scheduler/service";
import { UrlFetcherServiceImpl } from "../../src/modules/url-fetcher/service";
import { createMockLlmService } from "../mocks/llama-cpp";
import { createKernel } from "../../src/kernel";
import { VectorIndex } from "../../src/utils/vector-index";
import type { Kernel } from "../../src/kernel/types";

export function createTestKernel(): Kernel {
  const kernel = createKernel();
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  const settings = new SettingsService(db);
  settings.set("server.rate_limit_enabled", false); // Disable rate limiting in tests
  const llm = createMockLlmService();
  const chunkIndex = new VectorIndex(db, "chunks");
  const wikiIndex = new VectorIndex(db, "wiki_pages");

  kernel.provide("db", db);
  kernel.provide("settings", settings);
  kernel.provide("llm", llm);

  const docs = new DocumentsService(kernel);
  kernel.provide("docs", docs);
  kernel.provide("tags", new DocumentTagsService(db));
  kernel.provide("searchHistory", new SearchHistoryService(db));
  kernel.provide("search", new DocumentSearchService(db, llm, chunkIndex, settings));
  kernel.provide("chat", new ChatService(kernel));

  const wikiSynthesizer = new WikiSynthesizer(db, llm, wikiIndex, settings);
  const wikiCompiler = new WikiCompiler(db, llm, docs, settings, wikiSynthesizer);
  const wiki = new WikiService(kernel);
  wiki.setCompiler(wikiCompiler);
  kernel.provide("wiki", wiki);

  kernel.provide("memory", new MemoryService(kernel));
  kernel.provide("urlFetcher", new UrlFetcherServiceImpl(kernel));
  kernel.provide("scheduler", new SchedulerService(kernel));
  return kernel;
}
