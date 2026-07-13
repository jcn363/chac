# Changelog

## [1.12.0] - 2026-07-12

### Added

**Rate Limiting**
- `src/modules/router/rate-limit.ts`: in-memory per-IP rate limiting middleware
- Settings: `server.rate_limit_enabled` (default true), `server.rate_limit_max` (default 100 req/min)
- Returns 429 with `Retry-After` header when limit exceeded
- Configurable via Settings tab or API

**Health Check**
- `GET /api/health`: detailed system status (DB size, document/chunk/wiki counts, LLM status, scheduler tasks)
- Replaces simple `GET /api/status` endpoint

**Request Logging**
- `src/modules/router/request-logger.ts`: structured request logging with timing, status, IP
- Ring buffer stores last 1000 requests in memory
- `GET /api/logs`: returns recent request logs (configurable via `?limit=`)
- Colored console output (skips static assets)

**Auto-Backup**
- Scheduled task: exports database to `data/backups/backup-<timestamp>.json`
- Settings: `scheduler.auto_backup_enabled`, `scheduler.auto_backup_interval`, `scheduler.backup_retention`
- Automatic cleanup of old backups beyond retention limit

**Graceful Shutdown**
- Tracks in-flight requests via middleware counter
- Drains requests for up to 10 seconds before force-stopping
- Prevents data loss from interrupted writes

**Frontend Tests**
- `tests/unit/frontend/`: 36 JavaScript tests (dom, state, api)

**Document Metadata**
- `ingest()`/`reingest()` store parsed metadata (PDF pages/author, markdown HTML, etc.)

**Batch Wiki Compilation**
- `POST /api/wiki/compile` accepts optional `{ documentIds: string[] }` for selective compilation

**Search Analytics**
- `GET /api/search/analytics`: total searches, unique queries, avg results, top queries

**OpenAPI Updates**
- Added `/api/search/analytics`, updated wiki compile body, settings schema, document metadata

## [1.11.0] - 2026-07-12

### Added

**Shared Utilities**
- `src/utils/db-helpers.ts`: `deleteById()`, `countRows()`, `parsePagination()`, `extractErrorMessage()`
- `src/types/llm.ts`: shared `ChatCompletionLLM` type for cross-service LLM interface
- `src/modules/router/utils.ts`: shared `wrap()` error handler and `safeInt()` helper

**Settings Event System**
- `SettingsService.onChange()` — subscribe to setting changes (replaces monkey-patching)
- `DocumentsService.onIngest()` — callback after document ingestion
- `WikiService.onCompile()` — callback after wiki compilation

**Route Modularization** (api.ts: 424 lines → 31 lines)
- 13 domain route files under `src/modules/router/routes/`: status, settings, llm, documents, search-history, tags, suggest, chat, wiki, memory, cache, scheduler, backup

**Service Extraction**
- `src/modules/chat/rag.ts`: `RagRetriever` — RAG retrieval, context building, history budget
- `src/modules/documents/tags.ts`: `DocumentTagsService` — document tag CRUD
- `src/modules/documents/search-history.ts`: `SearchHistoryService` — search analytics
- `src/modules/documents/search.ts`: `DocumentSearchService` — semantic search, query expansion, reranking
- `src/modules/wiki/synthesizer.ts`: `WikiSynthesizer` — Union-Find clustering + LLM synthesis
- `src/modules/wiki/compiler.ts`: `WikiCompiler` — single-pass and multi-agent wiki compilation
- `src/modules/scheduler/tasks.ts`: `registerDefaultTasks()` — scheduler task definitions (moved from main.ts)

### Changed

- **Eliminated monkey-patching**: `main.ts` no longer reassigns `settings.set`, `docs.ingest`, or `wiki.compile` — uses event/callback patterns instead
- **Deduplicated inline types**: 13 inline `{ get: (key: string) => unknown }` annotations replaced with `SettingsServiceType` import
- **Deduplicated estimateTokens**: removed duplicate from `chunking.ts`, canonical in `llm-helpers.ts`
- **Services throw typed errors**: `NotFoundError`/`ValidationError` instead of plain `Error` with string matching
- **Route handlers use wrap()**: consistent error handling across all 47 endpoints
- **DocumentsService focused**: removed tags, search, search-history methods — now handles only document lifecycle (ingest/delete/list)
- **ChatService focused**: RAG retrieval extracted to `RagRetriever` — `sendMessage()` is now a thin orchestrator
- **WikiService focused**: compilation and synthesis extracted to `WikiCompiler` and `WikiSynthesizer`

## [1.10.0] - 2026-07-12

### Changed

- **Structured error handling in routes**: All route handlers now use `wrap()` for automatic error handling. `AppError` subclasses (`NotFoundError`, `ValidationError`) pass through as typed HTTP responses; unhandled errors become 500.
- **Services throw typed errors**: `DocumentsService.reingest()` and `DocumentTagsService` now throw `NotFoundError` instead of plain `Error` with string matching.
- **Removed manual try/catch in route handlers**: `routes/documents.ts` (reingest), `routes/tags.ts` (set/add tags), and `routes/backup.ts` (restore) no longer catch errors manually — they rely on `wrap()` + the global error handler.
- **Wrapped async route handlers**: `routes/suggest.ts` (suggest questions) and `routes/documents.ts` (search) now use `wrap()` for consistent error handling.

## [1.9.0] - 2026-07-12

### Fixed

- **Context auto-detection**: `queryModelInfo()` now queries `/v1/props` for real `n_ctx` value (was always returning 0)
- **Concurrency guard**: `ensureInstance()` prevents duplicate llama-server process spawns on parallel requests

### Changed

- **Parallel ingestion**: `batchIngest()` processes files in parallel batches of 4 via `Promise.allSettled()` (was sequential)
- **VectorIndex search**: `searchLevel()` uses O(n) linear scan instead of O(n log n) sort
- **VectorIndex cache**: `saveToDb()` uses incremental diff-based persistence (insert/update/delete only changed rows)
- **RAG deduplication**: Wiki and chunk results are deduplicated by content before RRF fusion
- **Settings validation**: `set()` enforces type, range, and enum constraints via `SETTING_VALIDATORS`

## [1.8.0] - 2026-07-11

### Added

**Caching**
- Generic in-memory cache with TTL support (`MemoryCache<T>`)
- Embedding cache — caches embeddings for 10 minutes (avoids redundant LLM calls)
- Search cache — caches search results for 2 minutes
- Automatic cleanup of expired entries
- Cache statistics (size, hit/miss tracking)

**Suggested Questions**
- AI-powered question generation based on document content
- Generate questions for a specific document or across all documents
- Configurable count (1-20 questions)
- API endpoint: `GET /api/suggest?documentId=...&count=5`

**Search History**
- Track all document searches with query, result count, expanded query, and reranking status
- Database table `search_history` with automatic timestamping
- API endpoint: `GET /api/search/history` — retrieve search history
- API endpoint: `DELETE /api/search/history` — clear search history
- Methods: `logSearch()`, `getSearchHistory()`, `clearSearchHistory()`

**Backup/Restore**
- Export entire database as JSON with all tables and data
- Import database from JSON backup, clearing existing data first
- API endpoint: `GET /api/backup` — export database as JSON
- API endpoint: `POST /api/restore` — import database from JSON backup
- Database backup utility functions: `exportDatabase()`, `importDatabase()`, `exportToFile()`, `importFromFile()`

**Document Format Support**
- PDF parsing — extract text, page count, title, author from PDF files
- DOCX parsing — extract text from Microsoft Word documents
- HTML parsing — extract text content, strip scripts/styles
- Markdown parsing — convert to plain text with structure preservation
- Auto-detection of file format by extension

**RAG Quality Improvements**
- Citation tracking — search results include source document title and content preview
- Query expansion — LLM expands queries with synonyms and related terms for better retrieval
- Reranking — LLM reranks initial search results by relevance
- Search API options: `expand: true` for query expansion, `rerank: true` for LLM reranking

**Conversation Export/Import**
- Export chat sessions to JSON with full message history
- Import JSON conversations with automatic ID regeneration
- API endpoint: `GET /api/chat/sessions/:id/export` — export session as JSON
- API endpoint: `POST /api/chat/import` — import conversation from JSON

## [1.1.0] - 2026-07-11

### Added

**Background Scheduler**
- SchedulerService for periodic background tasks with configurable intervals
- Memory consolidation task — deduplicates similar memory entries (default: 30min)
- Session cleanup task — archives sessions older than retention period (default: 1hr, 30 days retention)
- Index health check task — verifies vector index consistency (default: 15min)
- API endpoint: `GET /api/scheduler/status` — returns task states and schedules
- API endpoint: `POST /api/scheduler/run/:name` — manual task trigger
- 5 new settings: `scheduler.enabled`, `scheduler.memory_consolidation_interval`, `scheduler.session_cleanup_interval`, `scheduler.index_check_interval`, `scheduler.session_retention_days`

## [1.0.0] - 2026-07-11

First production release after comprehensive analysis and implementation across 10 phases.

### Added

**RAG Pipeline**
- Semantic chunking — splits text at sentence/paragraph boundaries (`rag.chunk_mode = "semantic"`)
- HNSW vector index — O(log n) approximate nearest neighbor search (replaces O(n) brute-force)
- Ranked fusion retrieval — merges wiki and chunk results via Reciprocal Rank Fusion (K=60)
- Token-aware context budget — fills context window up to model's capacity, not fixed message count
- Cross-document wiki synthesis — clusters related pages by embedding similarity, creates synthesis entries

**Model Infrastructure**
- Model selection UI — choose from preset models (1B–7B) with auto-configured settings
- Model hot-swap — change models in Settings without restarting the application
- Capability detection — queries model features (context length, architecture) after startup
- Context auto-detection — auto-sets `ctx_size` from model when `llm.chat.ctx_size.auto` is true

**Advanced Features**
- Cross-session memory — user preferences and facts remembered across chat sessions via `user_memory` table
- Knowledge compounding — high-value answers auto-feed back into wiki pages (`rag.auto_compound`)
- Multi-agent wiki — 3 parallel LLM agents (summarizer, fact extractor, connector) for richer entries (`wiki.agents_enabled`)

**Frontend**
- Interactive Settings tab — selects, inputs, checkboxes for all settings
- Model presets with auto-update — selecting a chat model updates `ctx_size`, selecting an embed model updates `dimensions`
- Memory tab — list/add/delete memory entries organized by category

**Infrastructure**
- Migration v3 — `user_memory` table with category/key/value/source/confidence
- 3 new settings: `rag.chunk_mode`, `rag.auto_compound`, `wiki.agents_enabled`, `memory.enabled`, `llm.chat.ctx_size.auto`
- API endpoints: `GET/PUT/DELETE /api/memory`

### Changed

- Retrieval from binary wiki-or-chunks fallback to ranked fusion (RRF)
- Context from fixed 20-message limit to token budget (70% of ctx_size)
- Chunking from character-only to character + semantic modes
- VectorIndex from brute-force to HNSW graph (>100 entries)
- Wiki compilation from single-pass to optional multi-agent mode
- Settings tab from display-only to interactive controls
- Document embedding batches processed in parallel (8 per batch)
- Wiki compilation runs 4 documents in parallel

### Fixed

- SQL injection risk in wiki document lookup (quoted document_id in LIKE clause)
- Dead conditional in HNSW insertion (identical ternary branches)
- Wrong chunk reference in knowledge compounding (always used first chunk instead of current)

### Performance

- HNSW search: 50× faster than brute-force (0.5ms vs 27ms at 500 vectors)
- RRF fusion: <1ms overhead for merging 100 results
- Memory operations: 100 entries in 6ms, context string in 1ms

### Documentation

- 8 new reference docs: GPT.md, SSA.md, MLA.md, Subq.md, Sub-quadratic.md (updated), MoE.md (updated)
- Full cross-reference map across all docs
- Updated README with all features, settings, and API endpoints
- Updated CLAUDE.md with architecture and performance notes

### Tests

- 190 tests across 23 files (up from 99 tests across 15 files)
- New test files: chunking-semantic, vector-index, chat-retrieval, chat-context-budget, wiki-synthesis, wiki-agents, wiki-advanced, memory, pipeline integration, performance benchmarks
