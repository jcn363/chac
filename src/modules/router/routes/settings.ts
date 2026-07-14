import { Hono } from "hono";
import type { Kernel } from "../../../kernel/types";
import { DEFAULT_SETTINGS, type SettingsServiceType } from "../../settings/types";
import { wrap } from "../utils";

export function setupSettingsRoutes(app: Hono, kernel: Kernel): void {
  const settings = kernel.get<SettingsServiceType>("settings");

  app.get("/api/settings", (c) => {
    return c.json(settings.getAll());
  });

  app.put("/api/settings", wrap(async (c) => {
    const body = await c.req.json<{ key: string; value: unknown }>();
    if (!body || typeof body.key !== "string" || body.key.length === 0) {
      return c.json({ error: "Missing or invalid key" }, 400);
    }
    if (body.value === undefined) {
      return c.json({ error: "Missing value" }, 400);
    }
    const knownKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    if (!knownKeys.has(body.key)) {
      return c.json({ error: "Unknown setting" }, 400);
    }
    const result = settings.set(body.key, body.value);
    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({ ok: true });
  }));
}
