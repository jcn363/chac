export interface ChatSession {
  id: string;
  title: string | null;
  system_prompt: string | null;
  model: string | null;
  metadata: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  context_chunks: string | null;
  context_scores: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  model: string | null;
  latency_ms: number | null;
  citations: string | null;
  metadata: string | null;
  created_at: string;
}

export interface SendMessageOptions {
  onChunk?: (chunk: string) => void;
  onDone?: (message: ChatMessage) => void;
}
