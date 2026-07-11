# Changelog

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
