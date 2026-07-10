export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function embeddingToBlob(embedding: number[]): Buffer {
  const buffer = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

export function blobToEmbedding(blob: Uint8Array | Buffer): Float32Array {
  const bytes = blob instanceof Buffer ? blob : Buffer.from(blob);
  const arr = new Float32Array(bytes.length / 4);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = bytes.readFloatLE(i * 4);
  }
  return arr;
}
