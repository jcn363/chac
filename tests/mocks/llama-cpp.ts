import type { LlmService, ChatCompletionOptions, EmbeddingOptions, EmbeddingResponse } from "../../src/modules/llm/types";

export function createMockLlmService(): LlmService {
  return {
    chat: {
      async *completions(options: ChatCompletionOptions): AsyncGenerator<string> {
        const lastMessage = options.messages[options.messages.length - 1];
        if (!lastMessage) throw new Error("No messages provided");
        const response = `Mock response to: "${lastMessage.content}"`;
        const words = response.split(" ");
        for (const word of words) {
          yield word + " ";
          await Bun.sleep(10);
        }
      },
    },
    embeddings: {
      async create(options: EmbeddingOptions): Promise<EmbeddingResponse> {
        // Deterministic mock embedding based on input content
        if (!options.input || options.input.length === 0) {
          return { data: [{ embedding: new Array(768).fill(0) }] };
        }
        const embedding = new Array(768).fill(0).map((_, i) => {
          const charCode = options.input.charCodeAt(i % options.input.length) || 0;
          return (charCode / 255) * 2 - 1;
        });
        return { data: [{ embedding }] };
      },
    },
    status() {
      return { chat: true, embed: true, vision: false, gpu: false, mtp: false };
    },
    async stop() {},
  };
}
