import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import type { Kernel } from "../../../src/kernel/types";
import type { WikiService } from "../../../src/modules/wiki/service";

let kernel: Kernel;
let wiki: WikiService;

beforeEach(() => {
  kernel = createTestKernel();
  wiki = kernel.get<WikiService>("wiki");
});

afterEach(() => {
  const db = kernel.get<{ close: () => void }>("db" as any);
  db.close();
});

describe("WikiService", () => {
  it("lists pages (empty)", () => {
    const result = wiki.list();
    expect(result.pages).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it("returns undefined for unknown page", () => {
    expect(wiki.get("nonexistent")).toBeUndefined();
  });
});
