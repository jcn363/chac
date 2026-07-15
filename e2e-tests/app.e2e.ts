import { test, expect } from "@playwright/test";

test.describe("Chac UI", () => {
  test.beforeAll(async ({ request }) => {
    // Disable rate limiting for E2E tests to avoid 429 during rapid test execution
    await request.put("/api/settings", {
      data: { key: "server.rate_limit_enabled", value: false },
      headers: { "Content-Type": "application/json" },
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for JS modules to load and execute
    await page.waitForFunction(
      () => document.getElementById("chat-tab")?.classList.contains("active"),
      { timeout: 10_000 }
    );
  });

  test("loads and shows all tabs", async ({ page }) => {
    await expect(page.locator("button.tab[data-tab='chat']")).toBeVisible();
    await expect(page.locator("button.tab[data-tab='documents']")).toBeVisible();
    await expect(page.locator("button.tab[data-tab='wiki']")).toBeVisible();
    await expect(page.locator("button.tab[data-tab='memory']")).toBeVisible();
    await expect(page.locator("button.tab[data-tab='settings']")).toBeVisible();
  });

  test("switches tabs", async ({ page }) => {
    // Click documents tab
    await page.click("button.tab[data-tab='documents']");
    // Wait for class to update
    await page.waitForFunction(
      () => document.getElementById("documents-tab")?.classList.contains("active")
    );
    await expect(page.locator("#documents-tab")).toHaveClass(/active/);

    // Click wiki tab
    await page.click("button.tab[data-tab='wiki']");
    await page.waitForFunction(
      () => document.getElementById("wiki-tab")?.classList.contains("active")
    );
    await expect(page.locator("#wiki-tab")).toHaveClass(/active/);

    // Click settings tab
    await page.click("button.tab[data-tab='settings']");
    await page.waitForFunction(
      () => document.getElementById("settings-tab")?.classList.contains("active")
    );
    await expect(page.locator("#settings-tab")).toHaveClass(/active/);

    // Click back to chat
    await page.click("button.tab[data-tab='chat']");
    await page.waitForFunction(
      () => document.getElementById("chat-tab")?.classList.contains("active")
    );
    await expect(page.locator("#chat-tab")).toHaveClass(/active/);
  });

  test("theme toggle works", async ({ page }) => {
    const body = page.locator("body");
    const initialClass = await body.getAttribute("class");

    await page.click("#theme-toggle");
    await page.waitForTimeout(500);
    const newClass = await body.getAttribute("class");
    expect(newClass).not.toBe(initialClass);
  });

  test("help overlay opens and closes", async ({ page }) => {
    await page.click("#help-toggle");
    await page.waitForFunction(
      () => !document.getElementById("help-overlay")?.classList.contains("hidden")
    );
    await expect(page.locator("#help-overlay")).not.toHaveClass(/hidden/);

    await page.click("#help-overlay .overlay-close");
    await page.waitForFunction(
      () => document.getElementById("help-overlay")?.classList.contains("hidden")
    );
    await expect(page.locator("#help-overlay")).toHaveClass(/hidden/);
  });

  test("chat: create session and send message", async ({ page }) => {
    await page.click("#new-session");
    await page.waitForTimeout(500);

    await page.fill("#chat-input", "Hello, what is this?");
    await page.click("#chat-form button[type='submit']");

    await page.waitForSelector(".message.assistant", { timeout: 10_000 });
    const response = await page.locator(".message.assistant").first().textContent();
    expect(response).toBeTruthy();
    expect(response!.length).toBeGreaterThan(0);
  });

  test("documents: empty state shows", async ({ page }) => {
    await page.click("button.tab[data-tab='documents']");
    await page.waitForFunction(
      () => document.getElementById("documents-tab")?.classList.contains("active")
    );
    await expect(page.locator("#doc-empty")).toBeVisible();
  });

  test("wiki: tab loads with list or empty state", async ({ page }) => {
    await page.click("button.tab[data-tab='wiki']");
    await page.waitForFunction(
      () => document.getElementById("wiki-tab")?.classList.contains("active")
    );
    // Wiki tab loads — either shows empty state or existing pages
    const hasContent = await page.locator("#wiki-list .wiki-item").count();
    const hasEmpty = await page.locator("#wiki-empty").isVisible().catch(() => false);
    expect(hasContent > 0 || hasEmpty).toBe(true);
  });

  test("memory: can add and see entry", async ({ page }) => {
    await page.click("button.tab[data-tab='memory']");
    await page.waitForFunction(
      () => document.getElementById("memory-tab")?.classList.contains("active")
    );

    await page.selectOption("#memory-category", "fact");
    await page.fill("#memory-key", "test-key");
    await page.fill("#memory-value", "test-value");
    await page.click("#memory-add-btn");

    await page.waitForTimeout(500);
    const list = await page.locator("#memory-list").textContent();
    expect(list).toContain("test-key");
  });

  test("settings: renders settings list", async ({ page }) => {
    await page.click("button.tab[data-tab='settings']");
    await page.waitForFunction(
      () => document.getElementById("settings-tab")?.classList.contains("active")
    );

    await page.waitForSelector("#settings-list > *", { timeout: 5_000 });
    const count = await page.locator("#settings-list > *").count();
    expect(count).toBeGreaterThan(0);
  });

  test("health endpoint returns OK", async ({ page }) => {
    const response = await page.request.get("/api/health");
    expect(response.ok()).toBe(true);
    const data = await response.json();
    expect(data.status).toBe("ok");
    expect(data).toHaveProperty("database");
    expect(data).toHaveProperty("llm");
  });
});
