export interface SettingValidator {
  type: 'string' | 'number' | 'boolean';
  min?: number;
  max?: number;
  enum?: string[];
}

export interface SettingsServiceType {
  get(key: string): unknown;
  getAll(): SettingRow[];
  set(key: string, value: unknown): { success: boolean; error?: string };
  onChange(handler: (key: string, value: unknown) => void): void;
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
  "llm.vision.ctx_size": { value: 4096, category: "llm", description: "Vision model context window size" },
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
  "rag.hnsw_m": { value: 16, category: "rag", description: "HNSW: max connections per node (higher = better recall, more memory)" },
  "rag.hnsw_ef_construction": { value: 100, category: "rag", description: "HNSW: build-time search width (higher = better graph quality, slower build)" },
  "rag.hnsw_ef_search": { value: 50, category: "rag", description: "HNSW: query-time search width (higher = better recall, slower search)" },
  "wiki.agents_enabled": { value: false, category: "rag", description: "Multi-agent wiki compilation (slower but richer)" },
  "memory.enabled": { value: true, category: "memory", description: "Enable cross-session memory" },
  "scheduler.enabled": { value: true, category: "scheduler", description: "Enable background scheduled tasks" },
  "scheduler.memory_consolidation_interval": { value: 1800000, category: "scheduler", description: "Memory consolidation interval (ms, default 30min)" },
  "scheduler.session_cleanup_interval": { value: 3600000, category: "scheduler", description: "Session cleanup interval (ms, default 1hr)" },
  "scheduler.session_retention_days": { value: 30, category: "scheduler", description: "Keep sessions newer than N days" },
  "scheduler.auto_backup_enabled": { value: true, category: "scheduler", description: "Enable automatic database backups" },
  "scheduler.auto_backup_interval": { value: 3600000, category: "scheduler", description: "Backup interval in ms (default 1hr)" },
  "scheduler.backup_retention": { value: 7, category: "scheduler", description: "Number of backup files to keep" },
  "scheduler.search_history_retention_days": { value: 30, category: "scheduler", description: "Keep search history newer than N days" },
  "memory.max_entries": { value: 500, category: "memory", description: "Max user memory entries (oldest pruned)" },
  "ui.dark_mode": { value: "system", category: "ui", description: "Dark mode: system, light, dark" },
  "ui.documents_per_page": { value: 20, category: "ui", description: "Pagination size" },
  "server.port": { value: 3000, category: "server", description: "HTTP server port" },
  "server.host": { value: "127.0.0.1", category: "server", description: "HTTP server bind address" },
  "server.rate_limit_enabled": { value: true, category: "server", description: "Enable API rate limiting" },
  "server.rate_limit_max": { value: 100, category: "server", description: "Max requests per minute per IP" },
  "transcription.model": { value: "base", category: "transcription", description: "Whisper model: tiny, base, small, medium, large" },
  "transcription.language": { value: "auto", category: "transcription", description: "Language code (auto, en, es, fr, etc.)" },
  "transcription.threads": { value: 4, category: "transcription", description: "CPU threads for transcription" },
};

export const SETTING_VALIDATORS: Record<string, SettingValidator> = {
  'llm.chat.ctx_size': { type: 'number', min: 512, max: 1048576 },
  'llm.chat.temperature': { type: 'number', min: 0, max: 2.0 },
  'llm.chat.threads': { type: 'number', min: 1, max: 128 },
  'llm.embed.dimensions': { type: 'number', min: 64, max: 4096 },
  'llm.gpu.layers': { type: 'number', min: -1, max: 200 },
  'llm.gpu.flash_attn': { type: 'string', enum: ['on', 'off', 'auto'] },
  'llm.gpu.split_mode': { type: 'string', enum: ['none', 'layer', 'row', 'tensor'] },
  'llm.mtp.draft_ngl': { type: 'number', min: 0, max: 200 },
  'rag.chunk_size': { type: 'number', min: 50, max: 10000 },
  'rag.chunk_overlap': { type: 'number', min: 0, max: 5000 },
  'rag.wiki_threshold': { type: 'number', min: 0, max: 1.0 },
  'rag.max_chunks': { type: 'number', min: 1, max: 50 },
  'rag.max_wiki_chars': { type: 'number', min: 100, max: 100000 },
  'rag.wiki_synthesis_threshold': { type: 'number', min: 0, max: 1.0 },
  'rag.hnsw_m': { type: 'number', min: 4, max: 64 },
  'rag.hnsw_ef_construction': { type: 'number', min: 10, max: 500 },
  'rag.hnsw_ef_search': { type: 'number', min: 10, max: 500 },
  'scheduler.memory_consolidation_interval': { type: 'number', min: 60000, max: 86400000 },
  'scheduler.session_cleanup_interval': { type: 'number', min: 60000, max: 86400000 },
  'scheduler.session_retention_days': { type: 'number', min: 1, max: 365 },
  'scheduler.auto_backup_interval': { type: 'number', min: 300000, max: 86400000 },
  'scheduler.backup_retention': { type: 'number', min: 1, max: 365 },
  'scheduler.search_history_retention_days': { type: 'number', min: 7, max: 365 },
  'memory.max_entries': { type: 'number', min: 50, max: 2000 },
  'server.port': { type: 'number', min: 1024, max: 65535 },
  'server.rate_limit_max': { type: 'number', min: 10, max: 10000 },
  'transcription.model': { type: 'string', enum: ['tiny', 'base', 'small', 'medium', 'large'] },
  'transcription.language': { type: 'string' },
  'transcription.threads': { type: 'number', min: 1, max: 32 },
  'ui.documents_per_page': { type: 'number', min: 1, max: 100 },
};
