import type { Database } from "bun:sqlite";
import { blobToEmbedding } from "./vector";

interface IndexEntry {
  id: string;
  content: string;
  embedding: Float32Array;
  norm: number;
}

export class VectorIndex {
  private entries: IndexEntry[] = [];
  private dirty = true;

  invalidate(): void {
    this.dirty = true;
  }

  private rebuild(db: Database, table: string, idCol: string, contentCol: string): void {
    if (!this.dirty) return;

    const rows = db
      .query(`SELECT ${idCol}, ${contentCol}, embedding FROM ${table} WHERE embedding IS NOT NULL`)
      .all() as Array<Record<string, unknown>>;

    this.entries = [];
    for (const row of rows) {
      const id = row[idCol] as string;
      const content = row[contentCol] as string;
      const embeddingBuf = row["embedding"] as Buffer;
      if (!id || !content || !embeddingBuf) continue;
      const embedding = blobToEmbedding(embeddingBuf);
      let norm = 0;
      for (let i = 0; i < embedding.length; i++) {
        const v = embedding[i]!;
        norm += v * v;
      }
      this.entries.push({
        id,
        content,
        embedding,
        norm: Math.sqrt(norm),
      });
    }

    this.dirty = false;
  }

  search(
    db: Database,
    table: string,
    idCol: string,
    contentCol: string,
    queryVec: Float32Array,
    options: { limit?: number; threshold?: number } = {}
  ): Array<{ id: string; content: string; score: number }> {
    const limit = options.limit ?? 5;
    const threshold = options.threshold ?? 0;

    this.rebuild(db, table, idCol, contentCol);

    // Precompute query norm once
    let queryNorm = 0;
    for (let i = 0; i < queryVec.length; i++) {
      const v = queryVec[i]!;
      queryNorm += v * v;
    }
    queryNorm = Math.sqrt(queryNorm);
    if (queryNorm === 0) return [];

    const results: Array<{ id: string; content: string; score: number }> = [];

    for (const entry of this.entries) {
      // Fast dot product
      let dot = 0;
      const len = Math.min(queryVec.length, entry.embedding.length);
      for (let i = 0; i < len; i++) {
        dot += queryVec[i]! * entry.embedding[i]!;
      }

      const denom = queryNorm * entry.norm;
      if (denom === 0) continue;

      const score = dot / denom;
      if (score >= threshold) {
        results.push({ id: entry.id, content: entry.content, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
