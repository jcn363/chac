export interface LlmInstance {
  process: Bun.ChildProcess;
  port: number;
  modelType: "chat" | "embed" | "vision";
  modelPath: string;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface EmbeddingOptions {
  input: string;
}

export interface EmbeddingResponse {
  data: { embedding: number[] }[];
}

export interface LlmService {
  chat: {
    completions(options: ChatCompletionOptions): AsyncGenerator<string>;
  };
  embeddings: {
    create(options: EmbeddingOptions): Promise<EmbeddingResponse>;
  };
  status(): { chat: boolean; embed: boolean; vision: boolean };
  stop(): Promise<void>;
}
