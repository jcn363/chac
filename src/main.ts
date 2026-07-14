import { createKernel } from "./kernel";
import { initDb, closeDb } from "./database";
import { SettingsService } from "./modules/settings/service";
import { LlmServiceImpl } from "./modules/llm/service";
import { DocumentsService } from "./modules/documents/service";
import { DocumentTagsService } from "./modules/documents/tags";
import { SearchHistoryService } from "./modules/documents/search-history";
import { DocumentSearchService } from "./modules/documents/search";
import { ChatService } from "./modules/chat/service";
import { WikiService } from "./modules/wiki/service";
import { WikiSynthesizer } from "./modules/wiki/synthesizer";
import { WikiCompiler } from "./modules/wiki/compiler";
import { MemoryService } from "./modules/memory/service";
import { SchedulerService } from "./modules/scheduler/service";
import { registerDefaultTasks } from "./modules/scheduler/tasks";
import { UrlFetcherServiceImpl } from "./modules/url-fetcher/service";
import { TranscriptionServiceImpl } from "./modules/transcription/service";
import { createRouter, requestTracker } from "./modules/router";
import { setupWebSocket } from "./modules/router/ws";
import { VectorIndex } from "./utils/vector-index";
import { createLogger } from "./utils/logger";

const log = createLogger("main");

const kernel = createKernel();

// Step 1: Database
const db = initDb();
kernel.provide("db", db);

// Step 2: Settings
const settings = new SettingsService(db);
kernel.provide("settings", settings);

// Step 3: LLM
const llm = new LlmServiceImpl(kernel);
kernel.provide("llm", llm);

// Step 3b: Wire model hot-swap — when model settings change, restart the LLM instance
settings.onChange((key, value) => {
  if (key === 'llm.chat.model' || key === 'llm.embed.model' || key === 'llm.vision.model') {
    const parts = key.split('.');
    const modelType = parts[1];
    if (modelType) {
      llm.restartInstance(modelType).catch((err) => {
        log.error(`Failed to restart ${modelType} model`, { error: String(err) });
      });
    }
  }
});

// Step 4: Services (created once, reused across requests)
// Register services to kernel BEFORE creating services that depend on them
const docs = new DocumentsService(kernel);
const tags = new DocumentTagsService(db);
const searchHistory = new SearchHistoryService(db);
const chunkIndex = new VectorIndex(db, "chunks");
const search = new DocumentSearchService(db, llm, chunkIndex, settings);
kernel.provide("docs", docs);
kernel.provide("tags", tags);
kernel.provide("searchHistory", searchHistory);
kernel.provide("search", search);

// Now create services that depend on kernel registrations
const chat = new ChatService(kernel);
const wikiIndex = new VectorIndex(db, "wiki_pages");
const wikiSynthesizer = new WikiSynthesizer(db, llm, wikiIndex, settings);
const wikiCompiler = new WikiCompiler(db, llm, docs, settings, wikiSynthesizer);
const wiki = new WikiService(kernel);
wiki.setCompiler(wikiCompiler);
const memory = new MemoryService(kernel);
kernel.provide("chat", chat);
kernel.provide("wiki", wiki);
kernel.provide("memory", memory);

// Step 4b: UrlFetcher
const urlFetcher = new UrlFetcherServiceImpl(kernel);
kernel.provide("urlFetcher", urlFetcher);

// Step 4c: Scheduler (background tasks)
const scheduler = new SchedulerService(kernel);
kernel.provide("scheduler", scheduler);

// Register scheduled tasks
registerDefaultTasks(scheduler, kernel);

// Step 4c: Transcription
const transcription = new TranscriptionServiceImpl();
kernel.provide("transcription", transcription);

// Step 5: Wire index invalidation — when docs/wiki change, invalidate search indexes
docs.onIngest(() => {
  chat.invalidateIndexes();
  docs.invalidateIndex();
  search.invalidateSearchCache();
});

wiki.onCompile(() => {
  chat.invalidateIndexes();
  wiki.invalidateIndex();
});

// Step 6: Router
const router = createRouter(kernel);

const rawPort = parseInt(process.env.PORT || "3000", 10);
if (!Number.isFinite(rawPort) || rawPort <= 0 || rawPort > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}
const PORT = rawPort;

const wsHandler = setupWebSocket(kernel);

const server = Bun.serve({
  port: PORT,
  fetch: router.fetch,
  websocket: wsHandler,
});

log.info(`Chac running at http://localhost:${server.port}`);

// Start background scheduler
scheduler.start();

// Graceful shutdown (guarded against double-signal)
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("Shutting down...");

  // Stop accepting new work
  scheduler.stop();

  // Wait for in-flight requests to complete (max 10 seconds)
  const deadline = Date.now() + 10_000;
  while (requestTracker.count > 0 && Date.now() < deadline) {
    log.info(`Waiting for ${requestTracker.count} in-flight request(s)...`);
    await Bun.sleep(100);
  }

  if (requestTracker.count > 0) {
    log.info(`Force stopping with ${requestTracker.count} request(s) still in progress`);
  }

  await llm.stop();
  await kernel.stop();
  closeDb();
  await server.stop();
  log.info("Shutdown complete");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
