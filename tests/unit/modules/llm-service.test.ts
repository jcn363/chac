import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../../helpers/setup";
import type { LlmService } from "../../../src/modules/llm/types";
import type { Kernel } from "../../../src/kernel/types";
import type { Database } from "bun:sqlite";

let kernel: Kernel;
let db: Database;

beforeEach(() => {
  kernel = createTestKernel();
  db = kernel.get<Database>("db");
});

afterEach(() => {
  db.close();
});

describe("LlmService (mock)", () => {
  it("chatCompletions yields mock response tokens", async () => {
    const llm = kernel.get<LlmService>("llm");
    const tokens: string[] = [];
    for await (const chunk of llm.chat.completions({
      messages: [{ role: "user", content: "hello" }],
    })) {
      tokens.push(chunk);
    }
    expect(tokens.length).toBeGreaterThan(0);
    const fullResponse = tokens.join("");
    expect(fullResponse).toContain("Mock response to:");
    expect(fullResponse).toContain("hello");
  });

  it("chatCompletions throws on empty messages", async () => {
    const llm = kernel.get<LlmService>("llm");
    const gen = llm.chat.completions({
      messages: [],
    });
    await expect(gen.next()).rejects.toThrow("No messages");
  });

  it("chatCompletions includes user message content in response", async () => {
    const llm = kernel.get<LlmService>("llm");
    const tokens: string[] = [];
    for await (const chunk of llm.chat.completions({
      messages: [{ role: "user", content: "What is RAG?" }],
    })) {
      tokens.push(chunk);
    }
    const fullResponse = tokens.join("");
    expect(fullResponse).toContain("What is RAG?");
  });

  it("createEmbedding returns 768-dim mock embedding", async () => {
    const llm = kernel.get<LlmService>("llm");
    const result = await llm.embeddings.create({
      input: "hello world",
    });
    expect(result).toBeDefined();
    expect(result.data).toBeDefined();
    expect(result.data.length).toBe(1);
    expect(result.data[0]!.embedding.length).toBe(768);
    expect(result.data[0]!.embedding[0]).toBeTypeOf("number");
  });

  it("createEmbedding returns zero vector for empty input", async () => {
    const llm = kernel.get<LlmService>("llm");
    const result = await llm.embeddings.create({
      input: "",
    });
    expect(result.data.length).toBe(1);
    expect(result.data[0]!.embedding.every((v) => v === 0)).toBe(true);
  });

  it("status reports mock state", () => {
    const llm = kernel.get<LlmService>("llm");
    const status = llm.status();
    expect(status.chat).toBe(true);
    expect(status.embed).toBe(true);
    expect(status.vision).toBe(false);
    expect(status.gpu).toBe(false);
    expect(status.mtp).toBe(false);
  });

  it("getModelInfo returns null in mock mode", () => {
    const llm = kernel.get<LlmService>("llm");
    const info = llm.getModelInfo("chat");
    expect(info).toBeNull();
  });

  it("getModelInfo returns null for unknown model type", () => {
    const llm = kernel.get<LlmService>("llm");
    const info = llm.getModelInfo("nonexistent");
    expect(info).toBeNull();
  });

  it("visionDescribe returns mock placeholder", async () => {
    const llm = kernel.get<LlmService>("llm");
    const result = await llm.visionDescribe("/fake/path.png");
    expect(result).toContain("Mock image description");
  });

  it("stop completes without error", async () => {
    const llm = kernel.get<LlmService>("llm");
    await expect(llm.stop()).resolves.toBeUndefined();
  });

  it("restartInstance completes without error", async () => {
    const llm = kernel.get<LlmService>("llm");
    await expect(llm.restartInstance("chat")).resolves.toBeUndefined();
  });
});
