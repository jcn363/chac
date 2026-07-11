import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { WikiService } from "../../../src/modules/wiki/service";
import type { Kernel } from "../../../src/kernel/types";

let kernel: Kernel;
let wiki: WikiService;

beforeEach(() => {
  kernel = createTestKernel();
  wiki = kernel.get<WikiService>("wiki");
});

afterEach(() => {
  kernel.get<{ close: () => void }>("db").close();
});

describe("WikiService", () => {
  it("compile returns empty array when no documents exist", async () => {
    const results = await wiki.compile();
    expect(results).toHaveLength(0);
  });

  it("list returns empty when no pages exist", () => {
    const { pages, total } = wiki.list();
    expect(pages).toHaveLength(0);
    expect(total).toBe(0);
  });

  it("get returns undefined for non-existent id", () => {
    const page = wiki.get("nonexistent");
    expect(page).toBeUndefined();
  });

  it("delete returns false for non-existent id", () => {
    const result = wiki.delete("nonexistent");
    expect(result).toBe(false);
  });

  it("search returns empty when no pages exist", async () => {
    const results = await wiki.search("test query");
    expect(results).toHaveLength(0);
  });
});

describe("Wiki Cross-Document Synthesis", () => {
  it("compile with no documents produces no synthesis pages", async () => {
    const results = await wiki.compile();
    expect(results).toHaveLength(0);
  });

  it("wiki pages have correct structure", () => {
    const { pages, total } = wiki.list();
    expect(Array.isArray(pages)).toBe(true);
    expect(typeof total).toBe("number");
  });
});
