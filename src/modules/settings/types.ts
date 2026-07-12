export interface SettingsServiceType {
  get(key: string): unknown;
  getAll(): SettingRow[];
  set(key: string, value: unknown): void;
}

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
  "llm.chat.ctx_size.auto": { value: true, category: "llm", description: "Auto-detect context size from model" },
  "llm.chat.temperature": { value: 0.7, category: "llm", description: "Sampling temperature" },
  "llm.chat.threads": { value: 4, category: "llm", description: "CPU threads for inference" },
  "llm.embed.model": { value: "nomic-ai/nomic-embed-text-v2-moe", category: "llm", description: "Embedding model name" },
  "llm.embed.dimensions": { value: 768, category: "llm", description: "Embedding vector dimensions" },
  "llm.vision.model": { value: "openbmb/MiniCPM-V-4.6", category: "llm", description: "Vision model name" },
  "llm.gpu.layers": { value: 20, category: "llm", description: "GPU layers to offload (0=CPU only, -1=all)" },
  "llm.gpu.flash_attn": { value: "on", category: "llm", description: "Flash Attention: on, off, auto" },
  "llm.gpu.split_mode": { value: "none", category: "llm", description: "GPU split: none, layer, row, tensor" },
  "llm.mtp.enabled": { value: false, category: "llm", description: "Enable Multi-Token Prediction (requires MTP-capable model)" },
  "llm.mtp.draft_ngl": { value: 10, category: "llm", description: "GPU layers for MTP draft model" },
  "rag.chunk_size": { value: 500, category: "rag", description: "Target chunk size (chars)" },
  "rag.chunk_overlap": { value: 100, category: "rag", description: "Overlap between chunks" },
  "rag.chunk_mode": { value: "character", category: "rag", description: "Chunking mode: character, semantic" },
  "rag.wiki_threshold": { value: 0.3, category: "rag", description: "Min similarity for wiki match" },
  "rag.max_chunks": { value: 5, category: "rag", description: "Max chunks for LLM context" },
  "rag.max_wiki_chars": { value: 4000, category: "rag", description: "Max chars for wiki synthesis" },
  "rag.wiki_synthesis_threshold": { value: 0.6, category: "rag", description: "Min similarity for cross-doc synthesis" },
  "rag.rerank": { value: false, category: "rag", description: "LLM-based reranking of search results" },
  "rag.expand": { value: false, category: "rag", description: "LLM-based query expansion before search" },
  "rag.auto_compound": { value: false, category: "rag", description: "Auto-feedback high-value answers into wiki" },
  "wiki.agents_enabled": { value: false, category: "rag", description: "Multi-agent wiki compilation (slower but richer)" },
  "memory.enabled": { value: true, category: "memory", description: "Enable cross-session memory" },
  "scheduler.enabled": { value: true, category: "scheduler", description: "Enable background scheduled tasks" },
  "scheduler.memory_consolidation_interval": { value: 1800000, category: "scheduler", description: "Memory consolidation interval (ms, default 30min)" },
  "scheduler.session_cleanup_interval": { value: 3600000, category: "scheduler", description: "Session cleanup interval (ms, default 1hr)" },
  "scheduler.index_check_interval": { value: 900000, category: "scheduler", description: "Index health check interval (ms, default 15min)" },
  "scheduler.session_retention_days": { value: 30, category: "scheduler", description: "Keep sessions newer than N days" },
  "ui.dark_mode": { value: "system", category: "ui", description: "Dark mode: system, light, dark" },
  "ui.documents_per_page": { value: 20, category: "ui", description: "Pagination size" },
  "server.port": { value: 3000, category: "server", description: "HTTP server port" },
  "server.host": { value: "127.0.0.1", category: "server", description: "HTTP server bind address" },
};
