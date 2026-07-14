import type { Database } from "bun:sqlite";
import type { LlmService, ChatMessage } from "../modules/llm/types";
import { generateId } from "./id";
import { embeddingToBlob } from "./vector";

/** Extract an embedding vector from the LLM for a single input string. */
export async function createEmbedding(llm: LlmService, input: string): Promise<Float32Array> {
  const result = await llm.embeddings.create({ input });
  const first = result.data[0];
  if (!first) throw new Error("No embedding returned");
  return new Float32Array(first.embedding);
}

/** Collect a non-streaming LLM completion into a single string. */
export async function collectLlmResponse(
  llm: Pick<LlmService, "chat">,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  let response = "";
  for await (const chunk of llm.chat.completions({ messages: messages as ChatMessage[], stream: false })) {
    response += chunk;
  }
  return response;
}

/** Extract JSON from an LLM response using a regex pattern. Returns null on failure. */
export function extractJsonFromLlm<T>(response: string, pattern: RegExp): T | null {
  try {
    const match = response.match(pattern);
    if (!match) return null;
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

/** Embed chunks and insert them into the database in batches. */
export async function embedAndInsertChunks(
  db: Database,
  chunks: Array<{ index: number; content: string; tokenCount: number }>,
  docId: string,
  llm: LlmService,
): Promise<void> {
  const insertChunk = db.query(
    "INSERT INTO chunks (id, document_id, chunk_index, content, token_count, embedding, embedding_model, embedding_dimensions) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );

  // Compute all embeddings in batches (async, outside transaction)
  const allBlobs: Buffer[] = [];
  const allDimensions: number[] = [];
  const BATCH_SIZE = 8;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const embeddings = await Promise.all(
      batch.map((chunk) => llm.embeddings.create({ input: chunk.content })),
    );
    for (let j = 0; j < batch.length; j++) {
      const firstEmb = embeddings[j]!.data[0];
      if (!firstEmb) throw new Error("No embedding returned");
      allBlobs.push(embeddingToBlob(firstEmb.embedding));
      allDimensions.push(firstEmb.embedding.length);
    }
  }

  // Insert all chunks in one transaction (sync)
  const insertAll = db.transaction(() => {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      insertChunk.run(
        generateId(),
        docId,
        chunk.index,
        chunk.content,
        chunk.tokenCount,
        allBlobs[i] ?? null,
        "local",
        allDimensions[i] ?? null,
      );
    }
  });
  insertAll();
}

/** Estimate token count from text length (~4 chars per token). */
export function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}
