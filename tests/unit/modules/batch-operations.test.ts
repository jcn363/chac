import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { createRouter } from "../../../src/modules/router";
import type { Kernel } from "../../../src/kernel/types";
import type { DocumentsService } from "../../../src/modules/documents/service";
import type { Database } from "bun:sqlite";

let kernel: Kernel;
let app: ReturnType<typeof createRouter>;
let docs: DocumentsService;
let db: Database;

beforeEach(() => {
  kernel = createTestKernel();
  docs = kernel.get<DocumentsService>("docs");
  db = kernel.get<Database>("db");
  app = createRouter(kernel);
});

function insertDoc(id: string, title: string, chunkCount: number = 1) {
  db.query(
    "INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)"
  ).run(id, title, `hash_${id}`, chunkCount);
  for (let i = 0; i < chunkCount; i++) {
    db.query(
      "INSERT INTO chunks (id, document_id, chunk_index, content) VALUES (?, ?, ?, ?)"
    ).run(`${id}_chunk${i}`, id, i, `Content ${i} for ${title}`);
  }
}

describe("POST /api/documents/batch", () => {
  it("returns error for empty paths", async () => {
    const res = await app.request("/api/documents/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns error for missing paths", async () => {
    const res = await app.request("/api/documents/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns error for more than 50 files", async () => {
    const paths = Array.from({ length: 51 }, (_, i) => `file${i}.txt`);
    const res = await app.request("/api/documents/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("50");
  });

  it("processes batch and reports errors for non-existent files", async () => {
    const res = await app.request("/api/documents/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: ["nonexistent1.txt", "nonexistent2.txt"] }),
    });
    expect(res.status).toBe(201);
    const data = await res.json() as { total: number; succeeded: number; failed: number; errors: Array<{ path: string; error: string }> };
    expect(data.total).toBe(2);
    expect(data.succeeded).toBe(0);
    expect(data.failed).toBe(2);
    expect(data.errors).toHaveLength(2);
  });
});

describe("POST /api/documents/batch/delete", () => {
  it("returns error for empty ids", async () => {
    const res = await app.request("/api/documents/batch/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("deletes existing documents and reports not-found", async () => {
    insertDoc("d1", "Doc 1");
    insertDoc("d2", "Doc 2");
    insertDoc("d3", "Doc 3");

    const res = await app.request("/api/documents/batch/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["d1", "d3", "nonexistent"] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { deleted: number; notFound: string[] };
    expect(data.deleted).toBe(2);
    expect(data.notFound).toEqual(["nonexistent"]);
  });

  it("cascades chunk deletion", async () => {
    insertDoc("d1", "Doc 1", 3);

    const chunkCount = (db.query("SELECT COUNT(*) as c FROM chunks WHERE document_id = 'd1'").get() as { c: number }).c;
    expect(chunkCount).toBe(3);

    await app.request("/api/documents/batch/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["d1"] }),
    });

    const afterCount = (db.query("SELECT COUNT(*) as c FROM chunks WHERE document_id = 'd1'").get() as { c: number }).c;
    expect(afterCount).toBe(0);
  });
});

describe("POST /api/documents/:id/reingest", () => {
  it("returns 404 for non-existent document", async () => {
    const res = await app.request("/api/documents/nonexistent/reingest", {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });

  it("returns error for document without source_path", async () => {
    insertDoc("d1", "No Path");
    db.query("UPDATE documents SET source_path = NULL WHERE id = 'd1'").run();

    const res = await app.request("/api/documents/d1/reingest", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("not found");
  });

  it("returns error for missing source file", async () => {
    insertDoc("d1", "Missing File");
    db.query("UPDATE documents SET source_path = '/nonexistent/file.txt' WHERE id = 'd1'").run();

    const res = await app.request("/api/documents/d1/reingest", {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const data = await res.json() as { error: string };
    expect(data.error).toContain("not found");
  });
});

describe("GET /api/documents/status", () => {
  it("returns empty status", async () => {
    const res = await app.request("/api/documents/status");
    expect(res.status).toBe(200);
    const data = await res.json() as { total: number; totalChunks: number; lastIngestedAt: string | null };
    expect(data.total).toBe(0);
    expect(data.totalChunks).toBe(0);
    expect(data.lastIngestedAt).toBeNull();
  });

  it("returns correct counts", async () => {
    insertDoc("d1", "Doc 1", 3);
    insertDoc("d2", "Doc 2", 2);

    const res = await app.request("/api/documents/status");
    expect(res.status).toBe(200);
    const data = await res.json() as { total: number; totalChunks: number; lastIngestedAt: string | null };
    expect(data.total).toBe(2);
    expect(data.totalChunks).toBe(5);
    expect(data.lastIngestedAt).toBeDefined();
  });
});

describe("DocumentsService batch methods", () => {
  it("batchIngest handles mix of valid and invalid paths", async () => {
    const result = await docs.batchIngest(["nonexistent.txt", "also_missing.txt"]);
    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(2);
    expect(result.errors).toHaveLength(2);
  });

  it("batchDelete removes multiple documents", () => {
    insertDoc("d1", "Doc 1");
    insertDoc("d2", "Doc 2");

    const result = docs.batchDelete(["d1", "d2", "d3"]);
    expect(result.deleted).toBe(2);
    expect(result.notFound).toEqual(["d3"]);
  });

  it("getStatus returns correct counts", () => {
    insertDoc("d1", "Doc 1", 2);
    insertDoc("d2", "Doc 2", 3);

    const status = docs.getStatus();
    expect(status.total).toBe(2);
    expect(status.totalChunks).toBe(5);
  });
});
