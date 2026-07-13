import { getCorrelationId } from "./tracing";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => log("debug", module, msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => log("info", module, msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => log("warn", module, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => log("error", module, msg, meta),
  };
}

function log(level: LogLevel, module: string, message: string, meta?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;

  const correlationId = getCorrelationId();
  const entry = { level, message, timestamp: new Date().toISOString(), correlationId, module, meta };
  console.error(JSON.stringify(entry));

  const color = { debug: "\x1b[90m", info: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" }[level];
  console.log(`${color}[${module}] ${message}\x1b[0m`);
}
