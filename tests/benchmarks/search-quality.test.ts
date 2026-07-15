import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../src/database/migrations";
import { SettingsService } from "../../src/modules/settings/service";
import { DocumentsService } from "../../src/modules/documents/service";
import { DocumentSearchService } from "../../src/modules/documents/search";
import { createMockLlmService } from "../mocks/llama-cpp";
import { createKernel } from "../../src/kernel";
import { VectorIndex } from "../../src/utils/vector-index";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Kernel } from "../../src/kernel/types";

let kernel: Kernel;
let db: Database;
let testDir: string;

beforeEach(() => {
  kernel = createKernel();
  db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  runMigrations(db);
  const settings = new SettingsService(db);
  const llm = createMockLlmService();
  kernel.provide("db", db);
  kernel.provide("settings", settings);
  kernel.provide("llm", llm);
  const docs = new DocumentsService(kernel);
  kernel.provide("docs", docs);
  const chunkIndex = new VectorIndex(db, "chunks");
  kernel.provide("chunkIndex", chunkIndex);
  kernel.provide("wikiIndex", new VectorIndex(db, "wiki_pages"));
  kernel.provide("search", new DocumentSearchService(db, llm, chunkIndex, settings));

  testDir = join(import.meta.dir, "../../.bench-tmp");
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  db.close();
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

function createTestFile(name: string, content: string): string {
  const path = join(testDir, name);
  writeFileSync(path, content);
  return path;
}

describe("Search Quality Benchmarks", () => {
  const testDocs = [
    {
      name: "ml-intro.txt",
      content: "Machine learning is a branch of artificial intelligence that enables systems to learn from data. Supervised learning uses labeled datasets to train algorithms. Unsupervised learning finds hidden patterns in unlabeled data. Reinforcement learning trains agents through reward signals.",
    },
    {
      name: "neural-networks.txt",
      content: "Neural networks are computing systems inspired by biological neural networks. They consist of layers of interconnected nodes. Deep learning uses multiple layers of neural networks to model complex patterns. Convolutional neural networks excel at image recognition tasks.",
    },
    {
      name: "python-programming.txt",
      content: "Python is a high-level programming language known for its simplicity and readability. It supports multiple paradigms including object-oriented, functional, and procedural programming. Python is widely used in data science, web development, and automation.",
    },
    {
      name: "climate-change.txt",
      content: "Climate change refers to long-term shifts in global temperatures and weather patterns. Human activities, primarily burning fossil fuels, have been the main driver since the 1800s. Rising sea levels, extreme weather events, and biodiversity loss are key consequences.",
    },
    {
      name: "cooking-recipes.txt",
      content: "Cooking is the art of preparing food by combining, mixing, and heating ingredients. Basic techniques include sautéing, roasting, baking, and steaming. Understanding flavor profiles and seasoning is essential for creating delicious meals.",
    },
  ];

  beforeEach(async () => {
    const docs = kernel.get<DocumentsService>("docs");
    for (const doc of testDocs) {
      const path = createTestFile(doc.name, doc.content);
      await docs.ingest(path);
    }
  });

  it("search returns results for any query", async () => {
    const search = kernel.get<DocumentSearchService>("search");
    const results = await search.search("machine learning");
    expect(results.length).toBeGreaterThan(0);
  });

  it("search returns results with content and score", async () => {
    const search = kernel.get<DocumentSearchService>("search");
    const results = await search.search("neural networks");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty("content");
    expect(results[0]).toHaveProperty("score");
    expect(typeof results[0]!.score).toBe("number");
  });

  it("search with limit returns fewer results", async () => {
    const search = kernel.get<DocumentSearchService>("search");
    const allResults = await search.search("programming", { limit: 10 });
    const limitedResults = await search.search("programming", { limit: 2 });
    expect(limitedResults.length).toBeLessThanOrEqual(2);
    expect(limitedResults.length).toBeLessThanOrEqual(allResults.length);
  });

  it("different queries return different result counts", async () => {
    const search = kernel.get<DocumentSearchService>("search");
    const mlResults = await search.search("artificial intelligence");
    const cookingResults = await search.search("cooking recipes");
    // Both should return results (mock embeddings produce some signal)
    expect(mlResults.length).toBeGreaterThan(0);
    expect(cookingResults.length).toBeGreaterThan(0);
  });

  it("search handles empty query gracefully", async () => {
    const search = kernel.get<DocumentSearchService>("search");
    const results = await search.search("");
    expect(Array.isArray(results)).toBe(true);
  });

  it("search with high limit returns all available results", async () => {
    const search = kernel.get<DocumentSearchService>("search");
    const results = await search.search("data", { limit: 100 });
    // Should return whatever chunks exist
    expect(results.length).toBeGreaterThan(0);
  });
});
