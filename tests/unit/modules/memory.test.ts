import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { MemoryService } from "../../../src/modules/memory/service";
import type { Kernel } from "../../../src/kernel/types";

let kernel: Kernel;
let memory: MemoryService;

beforeEach(() => {
  kernel = createTestKernel();
  memory = kernel.get<MemoryService>("memory");
});

afterEach(() => {
  kernel.get<{ close: () => void }>("db").close();
});

describe("MemoryService", () => {
  it("starts enabled by default", () => {
    expect(memory.isEnabled()).toBe(true);
  });

  it("can be disabled via settings", () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("memory.enabled", false);
    expect(memory.isEnabled()).toBe(false);
  });

  it("lists empty memory", () => {
    expect(memory.list()).toHaveLength(0);
  });

  it("creates memory entry", () => {
    const entry = memory.upsert("preference", "language", "English");
    expect(entry.category).toBe("preference");
    expect(entry.key).toBe("language");
    expect(entry.value).toBe("English");
    expect(entry.source).toBe("chat");
  });

  it("updates existing memory entry", () => {
    memory.upsert("preference", "language", "English");
    const updated = memory.upsert("preference", "language", "Spanish");
    expect(updated.value).toBe("Spanish");
    expect(memory.list()).toHaveLength(1);
  });

  it("gets memory by category and key", () => {
    memory.upsert("topic", "AI", "Machine learning");
    const entry = memory.get("topic", "AI");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("Machine learning");
  });

  it("returns undefined for non-existent entry", () => {
    expect(memory.get("preference", "nonexistent")).toBeUndefined();
  });

  it("deletes memory entry", () => {
    const entry = memory.upsert("fact", "capital", "Paris");
    expect(memory.delete(entry.id)).toBe(true);
    expect(memory.list()).toHaveLength(0);
  });

  it("returns false when deleting non-existent entry", () => {
    expect(memory.delete("nonexistent")).toBe(false);
  });

  it("lists entries sorted by category and key", () => {
    memory.upsert("topic", "zebra", "Z");
    memory.upsert("preference", "apple", "A");
    memory.upsert("fact", "mango", "M");
    const list = memory.list();
    expect(list[0]!.category).toBe("fact");
    expect(list[1]!.category).toBe("preference");
    expect(list[2]!.category).toBe("topic");
  });

  it("builds context string from entries", () => {
    memory.upsert("preference", "language", "English");
    memory.upsert("topic", "AI", "Machine learning");
    const ctx = memory.buildContextString();
    expect(ctx).toContain("preference:");
    expect(ctx).toContain("language: English");
    expect(ctx).toContain("topic:");
    expect(ctx).toContain("AI: Machine learning");
  });

  it("returns empty string when disabled", () => {
    const settings = kernel.get<{ set: (key: string, value: unknown) => void }>("settings");
    settings.set("memory.enabled", false);
    expect(memory.buildContextString()).toBe("");
  });

  it("returns empty string when no entries", () => {
    expect(memory.buildContextString()).toBe("");
  });
});
