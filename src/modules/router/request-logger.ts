import type { Context, Next } from "hono";
import { generateCorrelationId, runWithCorrelation } from "../../utils/tracing";
import type { SettingsServiceType } from "../settings/types";

interface RequestLog {
  method: string;
  path: string;
  status: number;
  duration: number;
  timestamp: string;
  ip?: string;
  correlationId: string;
}

const logs: RequestLog[] = [];
let maxLogs = 1000;

export function getRequestLogs(): RequestLog[] {
  return logs;
}

export function clearRequestLogs(): void {
  logs.length = 0;
}

export function setMaxLogs(max: number): void {
  maxLogs = max;
}

export function requestLogger(settings?: SettingsServiceType) {
  if (settings) {
    const configured = settings.get("server.log_max_entries");
    if (typeof configured === "number" && configured > 0) {
      maxLogs = configured;
    }
  }

  return async (c: Context, next: Next) => {
    const correlationId = generateCorrelationId();
    const start = performance.now();
    const ip =
      c.req.header("x-forwarded-for") ?? c.req.header("x-real-ip");

    await runWithCorrelation(correlationId, async () => {
      await next();
    });

    const duration = performance.now() - start;
    const entry: RequestLog = {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      duration: Math.round(duration * 100) / 100,
      timestamp: new Date().toISOString(),
      ip,
      correlationId,
    };

    logs.push(entry);
    if (logs.length > maxLogs) logs.shift();

    // Console output for non-asset requests
    if (
      !c.req.path.startsWith("/static/") &&
      !c.req.path.endsWith(".css") &&
      !c.req.path.endsWith(".js")
    ) {
      const statusColor =
        c.res.status >= 400
          ? "\x1b[31m"
          : c.res.status >= 300
            ? "\x1b[33m"
            : "\x1b[32m";
      console.log(
        `${statusColor}[${correlationId}] ${c.req.method} ${c.req.path} ${c.res.status}\x1b[0m ${duration.toFixed(1)}ms`,
      );
    }
  };
}
