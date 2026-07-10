export interface Chunk {
  index: number;
  content: string;
  tokenCount: number;
}

export function chunkText(
  text: string,
  chunkSize: number = 500,
  overlap: number = 100
): Chunk[] {
  if (overlap >= chunkSize) {
    throw new Error("chunk overlap must be less than chunk size");
  }
  if (chunkSize <= 0) {
    throw new Error("chunk size must be positive");
  }

  const chunks: Chunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const content = text.slice(start, end);
    chunks.push({
      index,
      content,
      tokenCount: estimateTokens(content),
    });
    index++;
    start += chunkSize - overlap;
  }

  return chunks;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
