export interface SettingRow {
  key: string;
  value: string;
  category: string;
  description: string | null;
  updated_at: string;
}

export interface SettingDefaults {
  [key: string]: { value: unknown; category: string; description: string };
}

export const DEFAULT_SETTINGS: SettingDefaults = {
  "llm.chat.model": { value: "openbmb/MiniCPM5-1B", category: "llm", description: "Chat model name" },
  "llm.chat.ctx_size": { value: 4096, category: "llm", description: "Context window size" },
  "llm.chat.temperature": { value: 0.7, category: "llm", description: "Sampling temperature" },
  "llm.chat.threads": { value: 4, category: "llm", description: "CPU threads for inference" },
  "llm.embed.model": { value: "nomic-ai/nomic-embed-text-v2-moe", category: "llm", description: "Embedding model name" },
  "llm.embed.dimensions": { value: 768, category: "llm", description: "Embedding vector dimensions" },
  "llm.vision.model": { value: "openbmb/MiniCPM-V-4.6", category: "llm", description: "Vision model name" },
  "rag.chunk_size": { value: 500, category: "rag", description: "Target chunk size (chars)" },
  "rag.chunk_overlap": { value: 100, category: "rag", description: "Overlap between chunks" },
  "rag.wiki_threshold": { value: 0.3, category: "rag", description: "Min similarity for wiki match" },
  "rag.max_chunks": { value: 5, category: "rag", description: "Max chunks for LLM context" },
  "rag.max_wiki_chars": { value: 4000, category: "rag", description: "Max chars for wiki synthesis" },
  "ui.dark_mode": { value: "system", category: "ui", description: "Dark mode: system, light, dark" },
  "ui.documents_per_page": { value: 20, category: "ui", description: "Pagination size" },
  "server.port": { value: 3000, category: "server", description: "HTTP server port" },
  "server.host": { value: "127.0.0.1", category: "server", description: "HTTP server bind address" },
};
