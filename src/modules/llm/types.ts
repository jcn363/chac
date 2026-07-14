export interface ModelCapabilities {
  contextLength: number;
  architecture: string;
  supportsVision: boolean;
}

export interface LlmInstance {
  process: Bun.Subprocess;
  port: number;
  modelType: "chat" | "embed" | "vision";
  modelPath: string;
  capabilities: ModelCapabilities | null;
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
  status(): { chat: boolean; embed: boolean; vision: boolean; gpu: boolean; mtp: boolean };
  getModelInfo(modelType: string): ModelCapabilities | null;
  restartInstance(modelType: string): Promise<void>;
  visionDescribe(imagePath: string): Promise<string>;
  stop(): Promise<void>;
}
