import { Hono } from "hono";
import { serveStatic } from "hono/bun";

export function setupStaticRoutes(app: Hono): void {
  app.use("/static/*", serveStatic({ root: "./src/public" }));
  app.get("/", serveStatic({ path: "./src/public/index.html" }));
  app.get("/sw.js", serveStatic({ path: "./src/public/sw.js" }));
}
