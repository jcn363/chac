/** Cosine similarity with pre-computed norms (faster for bulk search). */
export function cosineSimilarityFast(a: Float32Array, aNorm: number, b: Float32Array, bNorm: number): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
  }
  const denom = aNorm * bNorm;
  return denom === 0 ? 0 : dot / denom;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function embeddingToBlob(embedding: number[]): Buffer {
  const buffer = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i] ?? 0, i * 4);
  }
  return buffer;
}

export function blobToEmbedding(blob: Uint8Array | Buffer): Float32Array {
  const bytes = blob instanceof Buffer ? blob : Buffer.from(blob);
  if (bytes.length % 4 !== 0) throw new Error("Embedding blob length is not a multiple of 4");
  const arr = new Float32Array(bytes.length / 4);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = bytes.readFloatLE(i * 4);
  }
  return arr;
}
