import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e-tests",
  testMatch: "*.e2e.ts",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "bun run src/main.ts",
    port: 3000,
    timeout: 10_000,
    reuseExistingServer: true,
  },
});
