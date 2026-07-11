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

export function chunkTextSemantic(
  text: string,
  maxChunkTokens: number = 500,
  overlapSentences: number = 0
): Chunk[] {
  if (maxChunkTokens <= 0) {
    throw new Error("maxChunkTokens must be positive");
  }

  const paragraphs = splitParagraphs(text);
  const allSentences: string[] = [];

  for (const para of paragraphs) {
    const sentences = splitSentences(para);
    allSentences.push(...sentences);
  }

  if (allSentences.length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let currentSentences: string[] = [];
  let currentTokens = 0;
  let index = 0;

  for (let i = 0; i < allSentences.length; i++) {
    const sentence = allSentences[i]!;
    const sentenceTokens = estimateTokens(sentence);

    if (currentTokens + sentenceTokens > maxChunkTokens && currentSentences.length > 0) {
      const content = currentSentences.join(" ");
      chunks.push({
        index,
        content,
        tokenCount: estimateTokens(content),
      });
      index++;

      if (overlapSentences > 0) {
        const overlapStart = Math.max(0, currentSentences.length - overlapSentences);
        currentSentences = currentSentences.slice(overlapStart);
        currentTokens = currentSentences.reduce((sum, s) => sum + estimateTokens(s), 0);
      } else {
        currentSentences = [];
        currentTokens = 0;
      }
    }

    currentSentences.push(sentence);
    currentTokens += sentenceTokens;
  }

  if (currentSentences.length > 0) {
    const content = currentSentences.join(" ");
    chunks.push({
      index,
      content,
      tokenCount: estimateTokens(content),
    });
  }

  return chunks;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.!?])\s+/);
  const sentences: string[] = [];

  for (const s of raw) {
    const trimmed = s.trim();
    if (trimmed.length === 0) continue;

    if (trimmed.length > 200) {
      const subChunks = trimmed.split(/(?<=[,;:])\s+/);
      for (const sub of subChunks) {
        const subTrimmed = sub.trim();
        if (subTrimmed.length > 0) {
          sentences.push(subTrimmed);
        }
      }
    } else {
      sentences.push(trimmed);
    }
  }

  return sentences;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
