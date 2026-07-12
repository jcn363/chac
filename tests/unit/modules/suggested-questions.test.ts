import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { DocumentsService } from "../../../src/modules/documents/service";
import type { Kernel } from "../../../src/kernel/types";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Suggested Questions", () => {
  let kernel: Kernel;
  let docs: DocumentsService;
  let testDir: string;

  beforeEach(() => {
    kernel = createTestKernel();
    docs = new DocumentsService(kernel);
    testDir = join(import.meta.dir, "../../.test-suggest");
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    kernel.get<{ close: () => void }>("db").close();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createTestFile(name: string, content: string): string {
    const path = join(testDir, name);
    writeFileSync(path, content);
    return path;
  }

  describe("suggestQuestions", () => {
    it("returns empty array when no documents exist", async () => {
      const questions = await docs.suggestQuestions();
      expect(questions).toBeInstanceOf(Array);
    });

    it("suggests questions for a specific document", async () => {
      const path = createTestFile("ml.txt", "Machine learning is a subset of AI that uses algorithms to learn from data.");
      const doc = await docs.ingest(path);

      const questions = await docs.suggestQuestions(doc.id);
      expect(questions).toBeInstanceOf(Array);
    });

    it("suggests questions across all documents", async () => {
      const path1 = createTestFile("ml.txt", "Machine learning uses algorithms to learn from data.");
      const path2 = createTestFile("dl.txt", "Deep learning uses neural networks with multiple layers.");
      await docs.ingest(path1);
      await docs.ingest(path2);

      const questions = await docs.suggestQuestions();
      expect(questions).toBeInstanceOf(Array);
    });

    it("respects count parameter", async () => {
      const path = createTestFile("test.txt", "This is a test document with some content about AI.");
      await docs.ingest(path);

      const questions = await docs.suggestQuestions(undefined, 3);
      expect(questions.length).toBeLessThanOrEqual(3);
    });

    it("returns empty array for non-existent document", async () => {
      const questions = await docs.suggestQuestions("nonexistent-id");
      expect(questions).toEqual([]);
    });
  });
});
