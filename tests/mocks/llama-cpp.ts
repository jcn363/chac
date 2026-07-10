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
        const embedding = new Array(768).fill(0).map(() => Math.random() * 2 - 1);
        return { data: [{ embedding }] };
      },
    },
    status() {
      return { chat: true, embed: true, vision: false, gpu: false, mtp: false };
    },
    async stop() {},
  };
}
