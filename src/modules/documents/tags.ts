import type { Database } from "bun:sqlite";
import { NotFoundError } from "../../errors";
import { parsePagination } from "../../utils/db-helpers";
import type { Document, TagInfo } from "./types";

export class DocumentTagsService {
  constructor(private db: Database) {}

  addTags(documentId: string, tags: string[]): void {
    const doc = this.db.query("SELECT id FROM documents WHERE id = ?").get(documentId);
    if (!doc) throw new NotFoundError("Document", documentId);

    const insert = this.db.query(
      "INSERT OR IGNORE INTO document_tags (document_id, tag) VALUES (?, ?)"
    );
    const normalized = tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
    for (const tag of normalized) {
      insert.run(documentId, tag);
    }
  }

  removeTags(documentId: string, tags: string[]): void {
    const remove = this.db.query(
      "DELETE FROM document_tags WHERE document_id = ? AND tag = ?"
    );
    for (const tag of tags) {
      remove.run(documentId, tag.trim().toLowerCase());
    }
  }

  getDocumentTags(documentId: string): string[] {
    const rows = this.db
      .query("SELECT tag FROM document_tags WHERE document_id = ? ORDER BY tag")
      .all(documentId) as Array<{ tag: string }>;
    return rows.map((r) => r.tag);
  }

  setDocumentTags(documentId: string, tags: string[]): void {
    const doc = this.db.query("SELECT id FROM documents WHERE id = ?").get(documentId);
    if (!doc) throw new NotFoundError("Document", documentId);

    this.db.query("DELETE FROM document_tags WHERE document_id = ?").run(documentId);
    this.addTags(documentId, tags);
  }

  listTags(): TagInfo[] {
    return this.db
      .query(
        "SELECT tag, COUNT(DISTINCT document_id) as documentCount FROM document_tags GROUP BY tag ORDER BY documentCount DESC, tag"
      )
      .all() as TagInfo[];
  }

  getDocumentsByTag(tag: string, options: { page?: number; perPage?: number } = {}): {
    documents: Document[];
    total: number;
    page: number;
    perPage: number;
  } {
    const { page, perPage, offset } = parsePagination(options);
    const normalizedTag = tag.trim().toLowerCase();

    const total = (this.db
      .query("SELECT COUNT(*) as count FROM document_tags WHERE tag = ?")
      .get(normalizedTag) as { count: number }).count;

    const documents = this.db
      .query(
        "SELECT d.* FROM documents d JOIN document_tags dt ON d.id = dt.document_id WHERE dt.tag = ? ORDER BY d.created_at DESC LIMIT ? OFFSET ?"
      )
      .all(normalizedTag, perPage, offset) as Document[];

    return { documents, total, page, perPage };
  }
}
