import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createTestKernel } from "../../helpers/setup";
import { createRouter } from "../../../src/modules/router";
import { DocumentsService } from "../../../src/modules/documents/service";
import { getAppRoot } from "../../../src/platform/paths";
import type { Kernel } from "../../../src/kernel/types";
import type { Database } from "bun:sqlite";

let kernel: Kernel;
let docs: DocumentsService;
let app: ReturnType<typeof createRouter>;
let db: Database;
let tmpDir: string;

beforeEach(() => {
  kernel = createTestKernel();
  docs = kernel.get<DocumentsService>("docs");
  db = kernel.get<Database>("db");
  app = createRouter(kernel);
  // Create temp dir inside project root so ingest() path checks pass
  tmpDir = mkdtempSync(join(getAppRoot(), ".test-meta-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function insertDocWithMeta(id: string, title: string, metadata: Record<string, unknown> | null) {
  db.query(
    "INSERT INTO documents (id, title, content_hash, chunk_count, metadata) VALUES (?, ?, ?, ?, ?)"
  ).run(id, title, `hash_${id}`, 0, metadata ? JSON.stringify(metadata) : null);
}

describe("Document metadata persistence", () => {
  describe("ingest stores metadata", () => {
    it("stores HTML metadata from markdown file", async () => {
      const filePath = join(tmpDir, "test.md");
      writeFileSync(filePath, "# Hello\n\nThis is **bold** text.");
      const result = await docs.ingest(filePath);
      const doc = db.query("SELECT metadata FROM documents WHERE id = ?").get(result.id) as { metadata: string | null };
      expect(doc.metadata).not.toBeNull();
      const meta = JSON.parse(doc.metadata!);
      expect(meta.html).toBeDefined();
      expect(meta.html).toContain("Hello");
    });

    it("stores HTML originalLength from HTML file", async () => {
      const html = "<html><body><p>Content</p></body></html>";
      const filePath = join(tmpDir, "test.html");
      writeFileSync(filePath, html);
      const result = await docs.ingest(filePath);
      const doc = db.query("SELECT metadata FROM documents WHERE id = ?").get(result.id) as { metadata: string | null };
      expect(doc.metadata).not.toBeNull();
      const meta = JSON.parse(doc.metadata!);
      expect(meta.originalLength).toBe(html.length);
    });

    it("stores null metadata for plain text file", async () => {
      const filePath = join(tmpDir, "test.txt");
      writeFileSync(filePath, "Just plain text.");
      const result = await docs.ingest(filePath);
      const doc = db.query("SELECT metadata FROM documents WHERE id = ?").get(result.id) as { metadata: string | null };
      expect(doc.metadata).toBeNull();
    });
  });

  describe("reingest updates metadata", () => {
    it("updates metadata on reingest", async () => {
      const filePath = join(tmpDir, "test.md");
      writeFileSync(filePath, "# Title\n\nContent.");
      const result = await docs.ingest(filePath);
      const doc = db.query("SELECT metadata FROM documents WHERE id = ?").get(result.id) as { metadata: string | null };
      expect(doc.metadata).not.toBeNull();

      // Reingest with different content
      writeFileSync(filePath, "# New Title\n\n**Updated** content.");
      await docs.reingest(result.id);
      const updated = db.query("SELECT metadata FROM documents WHERE id = ?").get(result.id) as { metadata: string | null };
      expect(updated.metadata).not.toBeNull();
      const meta = JSON.parse(updated.metadata!);
      expect(meta.html).toContain("New Title");
    });
  });

  describe("API returns metadata", () => {
    it("GET /api/documents/:id includes metadata", async () => {
      insertDocWithMeta("d1", "Doc 1", { pages: 5, title: "Test" });
      const res = await app.request("/api/documents/d1");
      expect(res.status).toBe(200);
      const data = await res.json() as { id: string; metadata: string | null };
      expect(data.id).toBe("d1");
      expect(data.metadata).not.toBeNull();
      const meta = JSON.parse(data.metadata!);
      expect(meta.pages).toBe(5);
      expect(meta.title).toBe("Test");
    });

    it("GET /api/documents/:id returns null metadata when absent", async () => {
      insertDocWithMeta("d2", "Doc 2", null);
      const res = await app.request("/api/documents/d2");
      expect(res.status).toBe(200);
      const data = await res.json() as { id: string; metadata: string | null };
      expect(data.metadata).toBeNull();
    });

    it("GET /api/documents includes metadata in list", async () => {
      insertDocWithMeta("d1", "Doc 1", { pages: 3 });
      const res = await app.request("/api/documents");
      expect(res.status).toBe(200);
      const data = await res.json() as { documents: Array<{ id: string; metadata: string | null }> };
      const doc = data.documents.find((d) => d.id === "d1");
      expect(doc).toBeDefined();
      expect(doc!.metadata).not.toBeNull();
    });
  });
});
