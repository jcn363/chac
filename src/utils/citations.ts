import type { Database } from "bun:sqlite";

/** Format a citation string from a title and content preview. */
export function formatCitation(title: string, content: string): string {
  const preview = content.slice(0, 100).replace(/\n/g, " ").trim();
  return `Source: "${title}" — "${preview}..."`;
}

/** Generate a citation with document title by looking up the chunk's source document. */
export function generateCitation(
  db: Database,
  chunkId: string,
  content: string,
): { citation: string; documentTitle: string } {
  const row = db
    .query("SELECT c.document_id, d.title FROM chunks c JOIN documents d ON c.document_id = d.id WHERE c.id = ?")
    .get(chunkId) as { document_id: string; title: string } | undefined;
  if (!row) return { citation: "", documentTitle: "" };
  return {
    citation: formatCitation(row.title, content),
    documentTitle: row.title,
  };
}

/** Batch lookup citations for multiple chunk IDs. Returns a map of chunkId → { title, preview }. */
export function generateCitationsBatch(
  db: Database,
  chunkIds: string[],
): Map<string, { title: string; preview: string }> {
  if (chunkIds.length === 0) return new Map();
  const placeholders = chunkIds.map(() => "?").join(",");
  const rows = db
    .query(
      `SELECT c.id, d.title FROM chunks c JOIN documents d ON c.document_id = d.id WHERE c.id IN (${placeholders})`
    )
    .all(...chunkIds) as Array<{ id: string; title: string }>;
  const map = new Map<string, { title: string; preview: string }>();
  for (const row of rows) {
    map.set(row.id, { title: row.title || "Untitled", preview: "" });
  }
  return map;
}
