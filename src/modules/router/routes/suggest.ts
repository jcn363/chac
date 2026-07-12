import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import type { DocumentsService } from "../../documents/service";
import { safeInt, wrap } from "../utils";

export function setupSuggestRoutes(app: Hono, kernel: Kernel): void {
  const docs = kernel.get<DocumentsService>("docs");

  app.get("/api/suggest", wrap(async (c) => {
    const documentId = c.req.query("documentId") || undefined;
    const count = safeInt(c.req.query("count"), 5, 20);
    const questions = await docs.suggestQuestions(documentId, count);
    return c.json({ questions });
  }));
}
