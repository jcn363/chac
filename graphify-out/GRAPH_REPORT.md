# Graph Report - .  (2026-07-11)

## Corpus Check
- Corpus is ~28,068 words - fits in a single context window. You may not need a graph.

## Summary
- 263 nodes · 502 edges · 22 communities (12 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.85)
- Token cost: 71,257 input · 1,840 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Kernel & Ingestion Tests|Kernel & Ingestion Tests]]
- [[_COMMUNITY_Document Ingestion Pipeline|Document Ingestion Pipeline]]
- [[_COMMUNITY_LLM Service & Embeddings|LLM Service & Embeddings]]
- [[_COMMUNITY_Build System & Packaging|Build System & Packaging]]
- [[_COMMUNITY_Frontend App Logic|Frontend App Logic]]
- [[_COMMUNITY_Chat Service API|Chat Service API]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_Database & Migrations|Database & Migrations]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Documents Service API|Documents Service API]]
- [[_COMMUNITY_Llama Download Script|Llama Download Script]]
- [[_COMMUNITY_Model Download Script|Model Download Script]]
- [[_COMMUNITY_Start Script|Start Script]]
- [[_COMMUNITY_Start Script Config|Start Script Config]]
- [[_COMMUNITY_Install Script|Install Script]]
- [[_COMMUNITY_Setup All Script|Setup All Script]]
- [[_COMMUNITY_Karpathy Method|Karpathy Method]]
- [[_COMMUNITY_Main UI View|Main UI View]]
- [[_COMMUNITY_Mixture of Experts|Mixture of Experts]]
- [[_COMMUNITY_Swarm Intelligence|Swarm Intelligence]]

## God Nodes (most connected - your core abstractions)
1. `Kernel` - 21 edges
2. `ChatService` - 19 edges
3. `compilerOptions` - 19 edges
4. `LlmServiceImpl` - 14 edges
5. `runMigrations()` - 12 edges
6. `SettingsService` - 12 edges
7. `getAppRoot()` - 11 edges
8. `generateId()` - 11 edges
9. `DocumentsService` - 10 edges
10. `WikiService` - 10 edges

## Surprising Connections (you probably didn't know these)
- `createTestKernel()` --calls--> `runMigrations()`  [EXTRACTED]
  tests/helpers/setup.ts → src/database/migrations.ts
- `createTestKernel()` --calls--> `createKernel()`  [EXTRACTED]
  tests/helpers/setup.ts → src/kernel/index.ts
- `seedChunk()` --calls--> `generateId()`  [EXTRACTED]
  tests/unit/modules/chat-context.test.ts → src/utils/id.ts
- `seedWikiPage()` --calls--> `generateId()`  [EXTRACTED]
  tests/unit/modules/chat-context.test.ts → src/utils/id.ts
- `seedChunk()` --calls--> `embeddingToBlob()`  [EXTRACTED]
  tests/unit/modules/chat-context.test.ts → src/utils/vector.ts

## Import Cycles
- None detected.

## Communities (22 total, 10 thin omitted)

### Community 0 - "Kernel & Ingestion Tests"
Cohesion: 0.11
Nodes (14): createTestKernel(), testFile, createKernel(), KernelImpl, Kernel, Module, createMockLlmService(), json() (+6 more)

### Community 1 - "Document Ingestion Pipeline"
Cohesion: 0.14
Nodes (14): Text Chunking, seedChunk(), seedWikiPage(), Chunk, chunkText(), estimateTokens(), contentHash(), generateId() (+6 more)

### Community 2 - "LLM Service & Embeddings"
Cohesion: 0.13
Nodes (13): llama.cpp, isLlamaCppAvailable(), LlmServiceImpl, ChatCompletionOptions, ChatMessage, EmbeddingOptions, EmbeddingResponse, LlmInstance (+5 more)

### Community 3 - "Build System & Packaging"
Cohesion: 0.10
Nodes (17): BIN_DIR, build(), copyLauncher(), TARGETS, closeDb(), SettingsService, DEFAULT_SETTINGS, SettingDefaults (+9 more)

### Community 4 - "Frontend App Logic"
Cohesion: 0.15
Nodes (18): addMessage(), applyTheme(), closeHelp(), cycleTheme(), escapeHtml(), hideTypingIndicator(), loadDocuments(), loadHelpStatus() (+10 more)

### Community 5 - "Chat Service API"
Cohesion: 0.15
Nodes (5): Frontend Logic, ChatService, ChatMessage, ChatSession, SendMessageOptions

### Community 6 - "TypeScript Config"
Cohesion: 0.09
Nodes (21): compilerOptions, allowImportingTsExtensions, allowJs, lib, module, moduleDetection, moduleResolution, noEmit (+13 more)

### Community 7 - "Database & Migrations"
Cohesion: 0.18
Nodes (13): initDb(), ensureMetaTable(), getCurrentVersion(), Migration, MIGRATIONS, runMigrations(), Database Migrations, appPath() (+5 more)

### Community 8 - "Package Dependencies"
Cohesion: 0.11
Nodes (18): dependencies, dompurify, hono, marked, devDependencies, @types/bun, typescript, module (+10 more)

### Community 9 - "Documents Service API"
Cohesion: 0.27
Nodes (5): DocumentsService, Chunk, Document, IngestResult, SearchResult

## Knowledge Gaps
- **67 isolated node(s):** `TARGETS`, `BIN_DIR`, `start.sh script`, `name`, `version` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Kernel` connect `Kernel & Ingestion Tests` to `Document Ingestion Pipeline`, `LLM Service & Embeddings`, `Chat Service API`, `Documents Service API`?**
  _High betweenness centrality (0.115) - this node is a cross-community bridge._
- **Why does `ChatService` connect `Chat Service API` to `Kernel & Ingestion Tests`, `Document Ingestion Pipeline`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `LlmServiceImpl` connect `LLM Service & Embeddings` to `Kernel & Ingestion Tests`, `Build System & Packaging`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **What connects `TARGETS`, `BIN_DIR`, `start.sh script` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Kernel & Ingestion Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.11229946524064172 - nodes in this community are weakly interconnected._
- **Should `Document Ingestion Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.14393939393939395 - nodes in this community are weakly interconnected._
- **Should `LLM Service & Embeddings` be split into smaller, more focused modules?**
  _Cohesion score 0.13118279569892474 - nodes in this community are weakly interconnected._