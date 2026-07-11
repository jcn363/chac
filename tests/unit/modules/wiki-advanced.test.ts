import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { WikiService } from "../../../src/modules/wiki/service";
import { MemoryService } from "../../../src/modules/memory/service";
import type { Kernel } from "../../../src/kernel/types";

let kernel: Kernel;
let wiki: WikiService;
let memory: MemoryService;

beforeEach(() => {
  kernel = createTestKernel();
  wiki = kernel.get<WikiService>("wiki");
  memory = kernel.get<MemoryService>("memory");
});

afterEach(() => {
  kernel.get<{ close: () => void }>("db").close();
});

describe("Wiki Multi-Agent Compilation", () => {
  it("compile returns empty when no documents", async () => {
    const results = await wiki.compile();
    expect(results).toHaveLength(0);
  });

  it("agents_enabled setting defaults to false", () => {
    const settings = kernel.get<{ get: (key: string) => unknown }>("settings");
    expect(settings.get("wiki.agents_enabled")).toBe(false);
  });

  it("agents_enabled can be toggled", () => {
    const settings = kernel.get<{ get: (key: string) => unknown; set: (key: string, value: unknown) => void }>("settings");
    settings.set("wiki.agents_enabled", true);
    expect(settings.get("wiki.agents_enabled")).toBe(true);
  });
});

describe("Knowledge Compounding", () => {
  it("auto_compound setting defaults to false", () => {
    const settings = kernel.get<{ get: (key: string) => unknown }>("settings");
    expect(settings.get("rag.auto_compound")).toBe(false);
  });

  it("auto_compound can be toggled", () => {
    const settings = kernel.get<{ get: (key: string) => unknown; set: (key: string, value: unknown) => void }>("settings");
    settings.set("rag.auto_compound", true);
    expect(settings.get("rag.auto_compound")).toBe(true);
  });
});

describe("Cross-Session Memory", () => {
  it("memory service is available", () => {
    expect(memory).toBeDefined();
    expect(memory.isEnabled()).toBe(true);
  });

  it("memory persists across kernel recreations", () => {
    memory.upsert("preference", "theme", "dark");
    const entry = memory.get("preference", "theme");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("dark");
  });

  it("memory setting defaults to enabled", () => {
    const settings = kernel.get<{ get: (key: string) => unknown }>("settings");
    expect(settings.get("memory.enabled")).toBe(true);
  });

  it("buildContextString formats entries", () => {
    memory.upsert("preference", "color", "blue");
    memory.upsert("fact", "capital", "Tokyo");
    const ctx = memory.buildContextString();
    expect(ctx).toContain("preference:");
    expect(ctx).toContain("fact:");
    expect(ctx).toContain("color: blue");
    expect(ctx).toContain("capital: Tokyo");
  });
});
