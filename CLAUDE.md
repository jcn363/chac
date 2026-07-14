# CLAUDE.md — Chac Project

## What This Is

Chac is a portable RAG chat application that runs from a USB drive. All processing is local — no cloud dependencies. Follows the Karpathy Method: organize raw documents, compile them into a wiki, then query the wiki for answers.

## Quick Commands

| Command | What it does |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run dev` | Start dev server (hot reload) at http://localhost:3000 |
| `bun test` | Run all tests |
| `bun test --watch` | Run tests in watch mode |
| `bun test --coverage` | Run tests with coverage |
| `bun run build` | Cross-compile for 8 targets into `usb-drive/` |

**Always use `bun`, never `npm`.**

## Architecture

Microkernel with dependency injection. The kernel (`src/kernel/`) provides service registration via `kernel.provide(token, instance)` and retrieval via `kernel.get<T>(token)`.

### Service tokens (registered in `src/main.ts`)

- `db` — Bun SQLite database
- `settings` — SettingsService (in-memory cached, reads from DB, onChange events)
- `llm` — LlmServiceImpl (llama.cpp subprocess management)
- `docs` — DocumentsService (ingest, chunk, embed — document lifecycle only)
- `tags` — DocumentTagsService (document tag CRUD)
- `searchHistory` — SearchHistoryService (search analytics)
- `search` — DocumentSearchService (semantic search, query expansion, reranking)
- `chat` — ChatService (sessions, messages — delegates RAG to RagRetriever)
- `wiki` — WikiService (delegates compilation to WikiCompiler)
- `memory` — MemoryService (cross-session user memory)
- `chunkIndex` — VectorIndex singleton for chunks (kernel, shared across services)
- `wikiIndex` — VectorIndex singleton for wiki_pages (kernel, shared across services)
- `scheduler` — SchedulerService (background tasks: memory consolidation, session cleanup, search history cleanup, auto-backup)
- `transcription` — TranscriptionServiceImpl (Whisper.cpp binary management, speech-to-text)
- `urlFetcher` — UrlFetcherServiceImpl (URL content extraction + LLM descriptions)

### Source layout

```
src/
  main.ts              # Entry point: kernel init, service wiring, server start
  errors.ts            # AppError hierarchy (NotFound, Validation, Security, ExternalService)
  kernel/              # DI container (Kernel interface, Module lifecycle)
  database/            # SQLite init, migrations (inline schema, v8)
  modules/
    settings/          # SettingsService — DB-backed with in-memory cache
    llm/               # LlmServiceImpl — llama.cpp subprocess, streaming
    documents/         # DocumentsService — chunk, embed, ingest files
                         search.ts — Semantic search with reranking/expansion
                         search-history.ts — Search analytics
                         tags.ts — Document tag CRUD
    chat/              # ChatService — sessions, messages, RAG retrieval
                         rag.ts — RAG retrieval pipeline
    memory/            # MemoryService — cross-session user memory
    wiki/              # WikiService — Karpathy Method wiki compilation
                         compiler.ts — Wiki compilation logic
                         synthesizer.ts — Cross-document synthesis
    scheduler/         # SchedulerService — background tasks
                         tasks.ts — Task definitions and execution
    transcription/     # TranscriptionServiceImpl — Whisper.cpp speech-to-text
    url-fetcher/       # UrlFetcherServiceImpl — URL content extraction + LLM descriptions
    obsidian/          # ObsidianExporter — vault export with wikilinks and frontmatter
    router/            # Hono HTTP server, REST API routes, WebSocket, OpenAPI
                         utils.ts — wrap() error handler, safeInt() helper
                         routes/ — Individual route modules (15 files)
  platform/            # OS-specific paths (getAppRoot), binary resolution
  utils/               # Shared utilities (chunking, hashing, IDs, vectors, VectorIndex, cache, citations, document-parser, db-helpers, logger, tracing)
  public/              # Static frontend files (HTML, CSS, JS + componentized js/)
tests/
  helpers/setup.ts     # createTestKernel() for test isolation
  mocks/               # Mock LLM service (no llama.cpp needed)
  unit/                # Unit tests per module
Docs/                  # Reference documentation (see docs conventions below)
```

## Coding Rules

### TypeScript

- **Strict mode** — `tsconfig.json` has `strict: true`, `noUncheckedIndexedAccess: true`
- **ESNext target** — all modern features available
- **Bundler module resolution** — imports resolve via bundler, not Node
- **Type-only imports** — use `import type` for types when the value isn't needed at runtime (`verbatimModuleSyntax: true`)
- Avoid `any` — use `unknown` and narrow with type guards
- No unused variables flagged by linter, but `noUnusedLocals` is currently off in tsconfig

### Service pattern

Services receive the kernel in their constructor and pull dependencies via `kernel.get<T>(token)`. Services are singletons created once in `main.ts` — never instantiate them per-request in route handlers.

```typescript
// CORRECT: services from kernel
const docs = kernel.get<DocumentsService>("docs");

// WRONG: per-request instantiation
const docs = new DocumentsService(kernel);  // creates new VectorIndex each time
```

### VectorIndex

`VectorIndex` (`src/utils/vector-index.ts`) is an in-memory cache of embeddings for cosine similarity search. It uses lazy rebuild: call `invalidate()` when underlying data changes, and the index rebuilds on next `search()`.

**Singleton pattern**: Two VectorIndex instances (`chunkIndex`, `wikiIndex`) are created in `main.ts` and registered in the kernel. All services share these singletons via `kernel.get<VectorIndex>("chunkIndex")`. Invalidation is wired via event callbacks — no service owns its own instance.

### Database

SQLite via `bun:sqlite`. WAL mode, foreign keys on. All queries use parameterized statements (`.query(...).run(...)` with `?` placeholders). Never interpolate user input into SQL.

### HTTP

Hono framework. Routes defined in `src/modules/router/`. All responses return JSON unless streaming. Streaming uses `ReadableStream`.

### Frontend

Plain HTML/CSS/JS in `src/public/`. No framework — vanilla DOM manipulation. Markdown rendering via `marked`, sanitization via `dompurify`.

Settings tab renders interactive controls (selects, inputs, checkboxes) from `DEFAULT_SETTINGS`. Model presets defined in `MODEL_PRESETS` in `js/components/settings.js`. Changes saved via `PUT /api/settings`.

Memory tab manages cross-session memory via `GET/PUT/DELETE /api/memory`. Entries organized by category (preference, topic, fact, summary).

## Testing

- **Framework**: Bun's built-in test runner (`bun:test`)
- **Isolation**: Each test creates its own in-memory SQLite DB via `createTestKernel()` from `tests/helpers/setup.ts`
- **Mock LLM**: `tests/mocks/llama-cpp.ts` provides `createMockLlmService()` — no llama.cpp binary needed
- **Run pattern**: `bun test` (all), `bun test tests/unit/chat.test.ts` (single file)
- **New tests**: Add to `tests/unit/<module>/` matching the source module structure
- **Target**: 692 tests pass, 0 failures, 0 TypeScript errors (1386 expect() calls across 68 test files)

### Adding a new test

```typescript
import { describe, it, expect } from "bun:test";
import { createTestKernel } from "../helpers/setup";

describe("MyModule", () => {
  it("does the thing", () => {
    const kernel = createTestKernel();
    const service = kernel.get<SomeService>("token");
    expect(service.doThing()).toBe(true);
  });
});
```

## Docs/ Conventions

- All docs cross-reference each other via "See also:" lines at the end
- All docs link to `README.md`, `FAQ.md`, `BENCHMARK.md`
- New standalone reference docs must include "Relevance to Chac" section after Definition
- Use consistent anchor format: `filename.md#section-name`
- Factual claims must cite sources (arXiv IDs, benchmarks, URLs)

## Performance Notes

- `SettingsService.get()` is cached in-memory — no DB hit per call
- `VectorIndex` uses HNSW graph for O(log n) search (>100 entries), brute-force fallback for small indexes
- `VectorIndex` HNSW parameters (M, ef_construction, ef_search) are configurable via `rag.hnsw_*` settings
- `VectorIndex` searchLevel uses O(n) linear scan instead of O(n log n) sort
- `VectorIndex` saveToDb does incremental diff-based persistence (insert/update/delete only changed rows)
- Document embeddings process in batches of 8 (not sequential)
- Bulk ingestion processes files in parallel batches of 4 via `Promise.allSettled`
- Bulk DB operations (chunk insert, batch delete, ingest) wrapped in `db.transaction()` for 10-50x speedup
- Batch citation lookups: single `IN` query replaces N per-chunk queries in RAG pipeline
- Targeted docMap loading: only fetches titles for search results, not entire chunks table
- History budget limited to 200 messages with minimal columns (role, content only)
- Search analytics computed via SQL aggregation instead of full table scan
- Wiki compilation runs 4 documents in parallel
- Chat context fills by token budget (70% of ctx_size) — not fixed message count
- Ranked fusion retrieval merges wiki and chunk results via RRF (K=60) instead of binary fallback
- Wiki+chunk deduplication prevents duplicate content in RRF fusion
- `chunkTextSemantic()` splits at sentence/paragraph boundaries when `rag.chunk_mode = "semantic"`
- Wiki synthesis creates cross-document entries for related page groups
- Model hot-swap: changing `llm.*.model` setting auto-restarts the affected llama-server instance
- `LlmService.getModelInfo()` returns detected capabilities (context length, architecture) after startup
- Context auto-detection: `llm.chat.ctx_size` auto-updates from model when `llm.chat.ctx_size.auto` is true
- Concurrency guard: `ensureInstance()` prevents duplicate process spawns on parallel requests
- Cross-session memory: user preferences/topics/facts persist across chat sessions via `user_memory` table
- Knowledge compounding: high-value answers auto-feed into wiki pages when `rag.auto_compound` is true
- Multi-agent wiki: 3 parallel LLM agents (summarizer, fact extractor, connector) when `wiki.agents_enabled` is true
- Query expansion: LLM expands user query with synonyms/keywords before embedding when `rag.expand` is true
- LLM reranking: re-ranks RRF fusion results via LLM when `rag.rerank` is true
- Citation tracking: each context chunk includes source citation (title + preview), saved in `chat_messages.citations`
- Service singletons are created once at startup, not per-request
- `VectorIndex` persists HNSW cache to `vector_index_cache` table (migration v6) for faster cold starts
- Shared utilities: `llm-helpers.ts` (createEmbedding, collectLlmResponse, extractJsonFromLlm, embedAndInsertChunks, estimateTokens), `citations.ts` (generateCitation, generateCitationsBatch, formatCitation)
- Error hierarchy: `AppError`, `NotFoundError`, `ValidationError`, `SecurityError`, `ExternalServiceError` in `src/errors.ts`
- Settings validation: `SETTING_VALIDATORS` in `types.ts` enforces type/range/enum constraints on `set()`
- WebSocket streaming: real-time chat token delivery via `/ws` endpoint with message-based auth (client sends `{ type: "auth", token }` on connect)
- Frontend: componentized into `js/components/` (chat, documents, wiki, memory, settings, help) + `js/lib/` (api, dom, state)
- Service worker: offline-first caching for static assets, network-first for API calls
- OpenAPI 3.1 spec at `/api/openapi.json` documenting all endpoints
- Route handlers use `wrap()` for automatic error handling — `AppError` passes through, others become 500
- ALL route handlers are wrapped with `wrap()` for consistent typed error propagation
- Services throw typed errors (`NotFoundError`, `ValidationError`, `SecurityError`) — no string matching in route handlers
- Single LLM type: `LlmService` from `src/modules/llm/types.ts` (no duplicate `ChatCompletionLLM`)
- Settings type: `SettingsServiceType` from `src/modules/settings/types.ts` used consistently across all modules
- TranscriptionService: Whisper.cpp binary management (dev mode mock when binary absent), 5min timeout for large files
- UrlFetcherService: Built-in `fetch()` + `stripHtml()` for HTML content, LLM-generated descriptions, HEAD request for accessibility check
- Vision pipeline: `LlmService.visionDescribe()` sends images to vision model for text descriptions, used during image ingestion
- Image ingestion: DocumentParser detects image formats (JPEG, PNG, WebP, GIF, BMP, TIFF) via magic bytes, vision model generates descriptions
- File upload: `POST /api/documents/upload` accepts multipart file uploads, saves to tmp, ingests, cleans up
- CORS: restricted to localhost only (port from settings)
- CSP: Content-Security-Policy header with `default-src 'self'`, `img-src 'self' data: blob:`, `connect-src 'self' ws: wss:`
- Body limits: 10MB max for API requests, 50MB for file uploads
- Rate limiter: IP-based with configurable window and max requests
- Chat message validation: max 10,000 characters per message
- WebSocket reconnect: exponential backoff with jitter (1s → 30s max)
- Session search: filter sessions by title in the chat sidebar
- MemoryCache: LRU eviction with configurable max size (default 10K entries)
- Search history retention: configurable cleanup (default 30 days) via scheduler
- User memory cap: configurable max entries (default 500) enforced during consolidation
- `getStatus()` optimized from 3 queries to 1
- LLM `waitForReady()` uses exponential backoff instead of fixed sleep
- `restartInstance()` uses polling instead of fixed sleep for faster startup detection
- Auto-backup uses async I/O (non-blocking)
- `embeddingCache.startCleanup()` wired for periodic stale entry cleanup
- `createSession()` uses INSERT-only (no SELECT after insert)
- Service worker rotates cache names on update for reliable cache busting
- `exportDatabase()` includes `search_history` and `vector_index_cache` tables in backup
- Frontend parses API error response bodies for better error messages

## Build & Deploy

`bun run build` cross-compiles to 8 targets (linux-x64, linux-arm64, darwin-arm64, darwin-x64, windows-x64 — each with and without baseline). Output goes to `usb-drive/bin/`. Each binary embeds the full Bun runtime (~50-60MB).

## Environment

- `.env` file in project root (gitignored)
- `PORT` env var defaults to 3000
- `DEV_MODE=true` enables mock LLM responses
- `DATA_DIR` overrides default data directory location
