import { createKernel } from "./kernel";
import { initDb, closeDb } from "./database";
import { SettingsService } from "./modules/settings/service";
import { LlmServiceImpl } from "./modules/llm/service";
import { DocumentsService } from "./modules/documents/service";
import { ChatService } from "./modules/chat/service";
import { WikiService } from "./modules/wiki/service";
import { MemoryService } from "./modules/memory/service";
import { SchedulerService } from "./modules/scheduler/service";
import { createRouter } from "./modules/router";
import { setupWebSocket } from "./modules/router/ws";

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
const origSet = settings.set.bind(settings);
settings.set = (key: string, value: unknown) => {
  origSet(key, value);
  if (key === "llm.chat.model" || key === "llm.embed.model" || key === "llm.vision.model") {
    const parts = key.split(".");
    const modelType = parts[1];
    if (modelType) {
      llm.restartInstance(modelType).catch((err) => {
        console.error(`Failed to restart ${modelType} model:`, err);
      });
    }
  }
};

// Step 4: Services (created once, reused across requests)
const docs = new DocumentsService(kernel);
const chat = new ChatService(kernel);
const wiki = new WikiService(kernel);
const memory = new MemoryService(kernel);
kernel.provide("docs", docs);
kernel.provide("chat", chat);
kernel.provide("wiki", wiki);
kernel.provide("memory", memory);

// Step 4b: Scheduler (background tasks)
const scheduler = new SchedulerService(kernel);
kernel.provide("scheduler", scheduler);

// Register scheduled tasks
scheduler.register("memory-consolidation", 1800000, async () => {
  if (!memory.isEnabled()) return;
  const entries = memory.list();
  const seen = new Map<string, string>();
  for (const entry of entries) {
    const key = `${entry.category}:${entry.key}`;
    if (seen.has(key) && seen.get(key) === entry.value) {
      memory.delete(entry.id);
    } else {
      seen.set(key, entry.value);
    }
  }
});

scheduler.register("session-cleanup", 3600000, async () => {
  const retentionDays = (settings.get("scheduler.session_retention_days") as number) ?? 30;
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const db = kernel.get<import("bun:sqlite").Database>("db");
  db.query("DELETE FROM chat_sessions WHERE updated_at < ?").run(cutoff);
});

scheduler.register("index-check", 900000, async () => {
  chat.invalidateIndexes();
  docs.invalidateIndex();
  wiki.invalidateIndex();
});

// Step 5: Wire index invalidation — when docs/wiki change, invalidate search indexes
const origIngest = docs.ingest.bind(docs);
docs.ingest = async function (filePath: string) {
  const result = await origIngest(filePath);
  chat.invalidateIndexes();
  docs.invalidateIndex();
  return result;
};

const origCompile = wiki.compile.bind(wiki);
wiki.compile = async function () {
  const result = await origCompile();
  chat.invalidateIndexes();
  wiki.invalidateIndex();
  return result;
};

// Step 5: Router
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

console.log(`Chac running at http://localhost:${server.port}`);

// Start background scheduler
scheduler.start();

// Graceful shutdown (guarded against double-signal)
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Shutting down...");
  scheduler.stop();
  await llm.stop();
  await kernel.stop();
  closeDb();
  await server.stop();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
