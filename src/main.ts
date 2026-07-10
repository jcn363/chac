import { createKernel } from "./kernel";
import { initDb, closeDb } from "./database";
import { SettingsService } from "./modules/settings/service";
import { LlmServiceImpl } from "./modules/llm/service";
import { createRouter } from "./modules/router";

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

// Step 4: Router
const router = createRouter(kernel);

const rawPort = parseInt(process.env.PORT || "3000", 10);
if (!Number.isFinite(rawPort) || rawPort <= 0 || rawPort > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}
const PORT = rawPort;

const server = Bun.serve({
  port: PORT,
  fetch: router.fetch,
});

console.log(`Chac running at http://localhost:${server.port}`);

// Graceful shutdown (guarded against double-signal)
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("Shutting down...");
  await llm.stop();
  await kernel.stop();
  closeDb();
  await server.stop();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
