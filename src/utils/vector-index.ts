import type { Database } from "bun:sqlite";
import { blobToEmbedding } from "./vector";

interface IndexEntry {
  id: string;
  content: string;
  embedding: Float32Array;
  norm: number;
}

interface HnswNode {
  entryIdx: number;
  level: number;
  neighbors: Array<Array<number>>;
}

const M = 16;
const EF_CONSTRUCTION = 100;
const EF_SEARCH = 50;
const ML = 1 / Math.LN2;
const HNSW_THRESHOLD = 100;

export class VectorIndex {
  private entries: IndexEntry[] = [];
  private dirty = true;

  private hnswNodes: HnswNode[] = [];
  private hnswEntryIdx = -1;
  private hnswMaxLevel = 0;

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

    if (this.entries.length >= HNSW_THRESHOLD) {
      this.buildHnsw();
    } else {
      this.hnswNodes = [];
      this.hnswEntryIdx = -1;
      this.hnswMaxLevel = 0;
    }

    this.dirty = false;
  }

  private cosine(a: Float32Array, aNorm: number, b: Float32Array, bNorm: number): number {
    let dot = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i]! * b[i]!;
    }
    const denom = aNorm * bNorm;
    return denom === 0 ? 0 : dot / denom;
  }

  private buildHnsw(): void {
    this.hnswNodes = [];
    this.hnswEntryIdx = 0;
    this.hnswMaxLevel = 0;

    for (let i = 0; i < this.entries.length; i++) {
      const level = this.randomLevel();
      const maxConn = level === 0 ? M : M * 2;
      const neighbors: Array<Array<number>> = [];
      for (let l = 0; l <= level; l++) {
        neighbors.push(new Array<number>());
      }

      this.hnswNodes.push({ entryIdx: i, level, neighbors });

      if (level > this.hnswMaxLevel) {
        this.hnswMaxLevel = level;
        this.hnswEntryIdx = i;
      }
    }

    for (let i = 1; i < this.entries.length; i++) {
      this.hnswInsert(i);
    }
  }

  private randomLevel(): number {
    let level = 0;
    while (Math.random() < 0.5 && level < 16) {
      level++;
    }
    return level;
  }

  private hnswInsert(insertIdx: number): void {
    const entry = this.entries[insertIdx]!;
    const node = this.hnswNodes[insertIdx]!;
    let currIdx = this.hnswEntryIdx;

    for (let level = this.hnswMaxLevel; level > node.level; level--) {
      currIdx = this.greedySearchLevel(entry, currIdx, level, 1);
    }

    for (let level = Math.min(node.level, this.hnswMaxLevel); level >= 0; level--) {
      const candidates = this.searchLevel(entry, currIdx, level, EF_CONSTRUCTION);

      const maxConn = level === 0 ? M : M * 2;
      const neighbors = candidates.slice(0, maxConn);
      node.neighbors[level] = neighbors;

      for (const nIdx of neighbors) {
        const nNode = this.hnswNodes[nIdx]!;
        if (nNode.neighbors[level] && level < nNode.neighbors.length) {
          nNode.neighbors[level]!.push(insertIdx);
          const maxConn = level === 0 ? M : M * 2;
          if (nNode.neighbors[level]!.length > maxConn) {
            nNode.neighbors[level] = nNode.neighbors[level]!.slice(0, maxConn);
          }
        }
      }

      currIdx = candidates.length > 0 ? candidates[0]! : currIdx;
    }
  }

  private greedySearchLevel(query: IndexEntry, startIdx: number, level: number, ef: number): number {
    let bestIdx = startIdx;
    let bestScore = this.cosine(
      query.embedding,
      query.norm,
      this.entries[startIdx]!.embedding,
      this.entries[startIdx]!.norm
    );

    let improved = true;
    while (improved) {
      improved = false;
      const node = this.hnswNodes[bestIdx]!;
      const neighbors = node.neighbors[level] || [];

      for (const nIdx of neighbors) {
        if (nIdx === bestIdx) continue;
        const score = this.cosine(
          query.embedding,
          query.norm,
          this.entries[nIdx]!.embedding,
          this.entries[nIdx]!.norm
        );
        if (score > bestScore) {
          bestScore = score;
          bestIdx = nIdx;
          improved = true;
        }
      }
    }

    return bestIdx;
  }

  private searchLevel(query: IndexEntry, startIdx: number, level: number, ef: number): number[] {
    const visited = new Set<number>();
    const candidates: Array<{ idx: number; score: number }> = [];
    const results: Array<{ idx: number; score: number }> = [];

    const startScore = this.cosine(
      query.embedding,
      query.norm,
      this.entries[startIdx]!.embedding,
      this.entries[startIdx]!.norm
    );
    candidates.push({ idx: startIdx, score: startScore });
    results.push({ idx: startIdx, score: startScore });
    visited.add(startIdx);

    while (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const current = candidates.shift()!;

      if (results.length >= ef && current.score < results[results.length - 1]!.score) {
        break;
      }

      const node = this.hnswNodes[current.idx]!;
      const neighbors = node.neighbors[level] || [];

      for (const nIdx of neighbors) {
        if (visited.has(nIdx)) continue;
        visited.add(nIdx);

        const score = this.cosine(
          query.embedding,
          query.norm,
          this.entries[nIdx]!.embedding,
          this.entries[nIdx]!.norm
        );

        candidates.push({ idx: nIdx, score });
        results.push({ idx: nIdx, score });

        if (results.length > ef * 2) {
          results.sort((a, b) => b.score - a.score);
          results.length = ef;
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, ef).map((r) => r.idx);
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

    let queryNorm = 0;
    for (let i = 0; i < queryVec.length; i++) {
      const v = queryVec[i]!;
      queryNorm += v * v;
    }
    queryNorm = Math.sqrt(queryNorm);
    if (queryNorm === 0) return [];

    const useHnsw = this.entries.length >= HNSW_THRESHOLD && this.hnswNodes.length > 0;

    if (useHnsw) {
      return this.searchHnsw(queryVec, queryNorm, limit, threshold);
    }

    return this.searchBruteForce(queryVec, queryNorm, limit, threshold);
  }

  private searchHnsw(
    queryVec: Float32Array,
    queryNorm: number,
    limit: number,
    threshold: number
  ): Array<{ id: string; content: string; score: number }> {
    const queryEntry: IndexEntry = {
      id: "",
      content: "",
      embedding: queryVec,
      norm: queryNorm,
    };

    let currIdx = this.hnswEntryIdx;

    for (let level = this.hnswMaxLevel; level > 0; level--) {
      currIdx = this.greedySearchLevel(queryEntry, currIdx, level, 1);
    }

    const candidates = this.searchLevel(queryEntry, currIdx, 0, EF_SEARCH);

    const results: Array<{ id: string; content: string; score: number }> = [];
    for (const idx of candidates) {
      const entry = this.entries[idx]!;
      const score = this.cosine(queryVec, queryNorm, entry.embedding, entry.norm);
      if (score >= threshold) {
        results.push({ id: entry.id, content: entry.content, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  private searchBruteForce(
    queryVec: Float32Array,
    queryNorm: number,
    limit: number,
    threshold: number
  ): Array<{ id: string; content: string; score: number }> {
    const results: Array<{ id: string; content: string; score: number }> = [];

    for (const entry of this.entries) {
      const score = this.cosine(queryVec, queryNorm, entry.embedding, entry.norm);
      if (score >= threshold) {
        results.push({ id: entry.id, content: entry.content, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
}
