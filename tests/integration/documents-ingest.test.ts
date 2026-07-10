import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../helpers/setup";
import { DocumentsService } from "../../src/modules/documents/service";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

let kernel: ReturnType<typeof createTestKernel>;
let docs: DocumentsService;
const testFile = join(import.meta.dir, "../fixtures/test-doc.txt");

beforeEach(() => {
  kernel = createTestKernel();
  docs = new DocumentsService(kernel);
  writeFileSync(testFile, "This is a test document. It contains some text for chunking and embedding tests.");
});

afterEach(() => {
  try { unlinkSync(testFile); } catch {}
  const db = kernel.get<{ close: () => void }>("db" as any);
  db.close();
});

describe("DocumentsService", () => {
  it("ingests a document", async () => {
    const result = await docs.ingest(testFile);
    expect(result.id).toBeDefined();
    expect(result.title).toBe("test-doc.txt");
    expect(result.chunkCount).toBeGreaterThan(0);
  });

  it("lists documents", async () => {
    await docs.ingest(testFile);
    const list = docs.list();
    expect(list.documents.length).toBe(1);
    expect(list.total).toBe(1);
  });

  it("gets a document by id", async () => {
    const result = await docs.ingest(testFile);
    const doc = docs.get(result.id);
    expect(doc).toBeDefined();
    expect(doc!.title).toBe("test-doc.txt");
  });

  it("deletes a document", async () => {
    const result = await docs.ingest(testFile);
    const deleted = docs.delete(result.id);
    expect(deleted).toBe(true);
    expect(docs.get(result.id)).toBeUndefined();
  });

  it("deduplicates by content hash", async () => {
    const r1 = await docs.ingest(testFile);
    const r2 = await docs.ingest(testFile);
    expect(r1.id).toBe(r2.id);
  });
});
