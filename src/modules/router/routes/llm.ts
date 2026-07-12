import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";

export function setupLlmRoutes(app: Hono, kernel: Kernel): void {
  app.get("/api/llm/status", (c) => {
    const llm = kernel.get<{ status: () => unknown }>("llm");
    return c.json(llm.status());
  });
}
