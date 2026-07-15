import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import type { Context } from "hono";

function setCacheHeaders(c: Context, filePath: string): void {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'html') {
    c.header('Cache-Control', 'no-cache');
  } else if (ext === 'js' || ext === 'css') {
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2'].includes(ext ?? '')) {
    c.header('Cache-Control', 'public, max-age=86400');
  }
}

export function setupStaticRoutes(app: Hono): void {
  // Cache headers for /static/* — runs after serveStatic to set appropriate cache policy
  app.use("/static/*", async (c, next) => {
    await next();
    setCacheHeaders(c, c.req.path);
  });
  // Strip /static/ prefix: /static/styles.css → src/public/styles.css
  app.use("/static/*", serveStatic({
    root: "./src/public",
    rewriteRequestPath: (path) => path.replace(/^\/static/, ""),
  }));

  app.get("/", async (c, next) => {
    await next();
    setCacheHeaders(c, "index.html");
  });
  app.get("/", serveStatic({ path: "./src/public/index.html" }));

  app.get("/sw.js", async (c, next) => {
    await next();
    setCacheHeaders(c, "sw.js");
  });
  app.get("/sw.js", serveStatic({ path: "./src/public/sw.js" }));
}
