import { describe, it, expect, beforeEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import { createRouter } from "../../../src/modules/router";
import { DocumentsService } from "../../../src/modules/documents/service";
import type { Kernel } from "../../../src/kernel/types";
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

function insertDoc(id: string, title: string) {
  db.query(
    "INSERT INTO documents (id, title, content_hash, chunk_count) VALUES (?, ?, ?, ?)"
  ).run(id, title, `hash_${id}`, 0);
}

// --- Service-level tests ---

describe("DocumentsService tag methods", () => {
  it("addTags adds tags to a document", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["python", "tutorial"]);
    expect(docs.getDocumentTags("d1")).toEqual(["python", "tutorial"]);
  });

  it("addTags normalizes tags to lowercase and trims", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["  Python  ", "TUTORIAL"]);
    expect(docs.getDocumentTags("d1")).toEqual(["python", "tutorial"]);
  });

  it("addTags ignores duplicates", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["python"]);
    docs.addTags("d1", ["python", "java"]);
    const tags = docs.getDocumentTags("d1");
    expect(tags).toEqual(["java", "python"]);
  });

  it("addTags throws for non-existent document", () => {
    expect(() => docs.addTags("nonexistent", ["tag"])).toThrow("not found");
  });

  it("addTags filters empty tags", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["python", "", "  ", "java"]);
    expect(docs.getDocumentTags("d1")).toEqual(["java", "python"]);
  });

  it("removeTags removes specific tags", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["python", "java", "go"]);
    docs.removeTags("d1", ["java"]);
    expect(docs.getDocumentTags("d1")).toEqual(["go", "python"]);
  });

  it("removeTags is idempotent for missing tags", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["python"]);
    docs.removeTags("d1", ["nonexistent"]);
    expect(docs.getDocumentTags("d1")).toEqual(["python"]);
  });

  it("setDocumentTags replaces all tags", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["old1", "old2"]);
    docs.setDocumentTags("d1", ["new1", "new2"]);
    expect(docs.getDocumentTags("d1")).toEqual(["new1", "new2"]);
  });

  it("setDocumentTags with empty array clears all tags", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["python"]);
    docs.setDocumentTags("d1", []);
    expect(docs.getDocumentTags("d1")).toEqual([]);
  });

  it("setDocumentTags throws for non-existent document", () => {
    expect(() => docs.setDocumentTags("nonexistent", ["tag"])).toThrow("not found");
  });

  it("getDocumentTags returns empty for untagged document", () => {
    insertDoc("d1", "Doc 1");
    expect(docs.getDocumentTags("d1")).toEqual([]);
  });

  it("listTags returns all tags with document counts", () => {
    insertDoc("d1", "Doc 1");
    insertDoc("d2", "Doc 2");
    docs.addTags("d1", ["python", "tutorial"]);
    docs.addTags("d2", ["python", "reference"]);

    const tags = docs.listTags();
    expect(tags).toEqual([
      { tag: "python", documentCount: 2 },
      { tag: "reference", documentCount: 1 },
      { tag: "tutorial", documentCount: 1 },
    ]);
  });

  it("listTags returns empty when no tags exist", () => {
    expect(docs.listTags()).toEqual([]);
  });

  it("getDocumentsByTag returns documents with specific tag", () => {
    insertDoc("d1", "Doc 1");
    insertDoc("d2", "Doc 2");
    insertDoc("d3", "Doc 3");
    docs.addTags("d1", ["python"]);
    docs.addTags("d2", ["python", "java"]);
    docs.addTags("d3", ["java"]);

    const result = docs.getDocumentsByTag("python");
    expect(result.total).toBe(2);
    expect(result.documents.map((d) => d.id).sort()).toEqual(["d1", "d2"]);
  });

  it("getDocumentsByTag normalizes tag", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["Python"]);

    const result = docs.getDocumentsByTag("PYTHON");
    expect(result.total).toBe(1);
  });

  it("getDocumentsByTag returns empty for non-existent tag", () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["python"]);

    const result = docs.getDocumentsByTag("java");
    expect(result.total).toBe(0);
    expect(result.documents).toEqual([]);
  });

  it("getDocumentsByTag supports pagination", () => {
    for (let i = 0; i < 5; i++) {
      insertDoc(`d${i}`, `Doc ${i}`);
      docs.addTags(`d${i}`, ["common"]);
    }

    const page1 = docs.getDocumentsByTag("common", { page: 1, perPage: 2 });
    expect(page1.total).toBe(5);
    expect(page1.documents).toHaveLength(2);

    const page3 = docs.getDocumentsByTag("common", { page: 3, perPage: 2 });
    expect(page3.documents).toHaveLength(1);
  });
});

// --- API-level tests ---

describe("GET /api/tags", () => {
  it("returns empty array when no tags", async () => {
    const res = await app.request("/api/tags");
    expect(res.status).toBe(200);
    const data = await res.json() as unknown[];
    expect(data).toEqual([]);
  });

  it("returns tags with counts", async () => {
    insertDoc("d1", "Doc 1");
    insertDoc("d2", "Doc 2");
    docs.addTags("d1", ["python"]);
    docs.addTags("d2", ["python", "java"]);

    const res = await app.request("/api/tags");
    expect(res.status).toBe(200);
    const data = await res.json() as Array<{ tag: string; documentCount: number }>;
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ tag: "python", documentCount: 2 });
    expect(data[1]).toEqual({ tag: "java", documentCount: 1 });
  });
});

describe("GET /api/tags/:tag/documents", () => {
  it("returns documents with tag", async () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["python"]);

    const res = await app.request("/api/tags/python/documents");
    expect(res.status).toBe(200);
    const data = await res.json() as { documents: Array<{ id: string }>; total: number };
    expect(data.total).toBe(1);
    expect(data.documents[0]!.id).toBe("d1");
  });

  it("returns empty for non-existent tag", async () => {
    const res = await app.request("/api/tags/java/documents");
    expect(res.status).toBe(200);
    const data = await res.json() as { total: number };
    expect(data.total).toBe(0);
  });
});

describe("PUT /api/documents/:id/tags", () => {
  it("replaces all tags", async () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["old"]);

    const res = await app.request("/api/documents/d1/tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["new1", "new2"] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { tags: string[] };
    expect(data.tags).toEqual(["new1", "new2"]);
  });

  it("returns 404 for non-existent document", async () => {
    const res = await app.request("/api/documents/nonexistent/tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["tag"] }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing tags", async () => {
    insertDoc("d1", "Doc 1");
    const res = await app.request("/api/documents/d1/tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/documents/:id/tags", () => {
  it("adds tags without removing existing", async () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["existing"]);

    const res = await app.request("/api/documents/d1/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["new"] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { tags: string[] };
    expect(data.tags).toContain("existing");
    expect(data.tags).toContain("new");
  });

  it("returns 404 for non-existent document", async () => {
    const res = await app.request("/api/documents/nonexistent/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["tag"] }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/documents/:id/tags", () => {
  it("removes specific tags", async () => {
    insertDoc("d1", "Doc 1");
    docs.addTags("d1", ["python", "java", "go"]);

    const res = await app.request("/api/documents/d1/tags", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["java"] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json() as { tags: string[] };
    expect(data.tags).toEqual(["go", "python"]);
  });
});
