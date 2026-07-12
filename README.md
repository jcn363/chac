# Chac

> Portable RAG (Retrieval-Augmented Generation) chat for Linux, macOS, Windows.
> All processing is local — no cloud dependencies. Runs `llama.cpp` via USB drive.
> Follows the Karpathy Method: organize raw documents, compile them into a wiki, then query the wiki for answers.

## Table of Contents

- [Features](#features)
- [Documentation](#documentation)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Configuration](#configuration)
- [Development](#development)
- [Testing](#testing)
- [Build & Deployment](#build--deployment)
- [USB Drive Setup](#usb-drive-setup)
- [Troubleshooting](#troubleshooting)
- [FAQ](FAQ.md)

---

## Features

- **RAG Chat** — ask questions grounded in your documents
- **Ranked Fusion Retrieval** — merges wiki and chunk results via Reciprocal Rank Fusion (K=60)
- **Semantic Chunking** — splits text at sentence/paragraph boundaries (configurable)
- **HNSW Vector Search** — O(log n) approximate nearest neighbor search (O(n) fallback for small indexes)
- **Token-Aware Context** — fills context window up to model's capacity, not fixed message count
- **Cross-Session Memory** — user preferences and facts remembered across chat sessions
- **Knowledge Compounding** — high-value answers auto-feed back into wiki pages
- **Multi-Agent Wiki** — 3 parallel LLM agents synthesize richer wiki entries (optional)
- **Wiki (Karpathy Method)** — compile documents into structured wiki entries using LLM
- **Model Selection** — choose from preset models (1B–7B) with auto-configured settings
- **Model Hot-Swap** — change models in Settings without restarting
- **Markdown Rendering** — messages render markdown (bold, italic, code blocks, lists, tables, links)
- **Chat Export** — download session history as markdown files
- **Chat Search** — search and highlight messages within a session
- **Session Management** — create, rename (double-click), delete, reorder (drag-and-drop), search sessions
- **GPU Acceleration** — CUDA/Metal/Vulkan offloading via `llm.gpu.layers` setting
- **Flash Attention** — memory-efficient attention via `llm.gpu.flash_attn` setting
- **Multi-Token Prediction** — speculative decoding for faster inference (requires MTP-capable model)
- **Vision Model** — multimodal support via `llm.vision.model` setting
- **Portable & Cross-Platform** — runs on any OS via USB drive (Windows, macOS, Linux)
- **Document Ingestion** — chunk, embed, and store any text file
- **Streaming Responses** — real-time streaming from `llama.cpp`
- **Dark Mode** — toggle between system/light/dark themes
- **Help System** — in-app help overlay with quick start, keyboard shortcuts, tips, troubleshooting, and live system status
- **Toasts** — non-intrusive notifications for success/error feedback
- **Empty States** — contextual guidance when tabs have no content
- **Loading States** — visual feedback during async operations
- **Keyboard Shortcuts** — `?` help, `Esc` close, `Ctrl+Enter` send, tab navigation
- **Accessibility** — focus rings, ARIA labels, reduced-motion support, touch targets
- **Responsive** — adapts to mobile screens (sidebar hides on narrow viewports)
- **Dev Mode** — mock LLM responses for development without `llama.cpp`

---

## Documentation

Technical reference docs in `Docs/`:

| Doc | Topic | Description |
|-----|-------|-------------|
| [Docs/GPT.md](Docs/GPT.md) | GPT Architecture | Transformer decoder, scaling laws, and evolution of generative pre-training |
| [Docs/Karpathy.md](Docs/Karpathy.md) | The Karpathy Method | Core RAG pipeline: ingest → compile wiki → query with two-tier retrieval |
| [Docs/MoE.md](Docs/MoE.md) | Mixture of Experts | MoE architecture, routing, load balancing, and modern variants (2025–2026) |
| [Docs/Swarm.md](Docs/Swarm.md) | Swarm Intelligence | Swarm algorithms, LLM-based multi-agent systems, and governance |
| [Docs/Sub-quadratic.md](Docs/Sub-quadratic.md) | Sub-Quadratic Attention | Linear attention, SSMs, sparse attention, and alternatives to O(n²) |
| [Docs/Subq.md](Docs/Subq.md) | SubQ-1.1-Small | SubQ model card: SSA mechanism, training, results, and implications |
| [Docs/SSA.md](Docs/SSA.md) | SSA Deep-Dive | Technical analysis of Subquadratic Sparse Attention mechanism |
| [Docs/MLA.md](Docs/MLA.md) | MLA Deep-Dive | Multi-Head Latent Attention: KV cache compression via low-rank decomposition |
| [Docs/ObsidianSA.md](Docs/ObsidianSA.md) | Obsidian Vault Philosophy | Steph Ango's vault structure, linking philosophy, and knowledge management principles |
| [Docs/Dspark.md](Docs/Dspark.md) | DSpark Speculative Decoding | DeepSeek's DSpark framework: semi-autoregressive drafting, confidence-scheduled verification, 60–85% inference speedup |
| [Docs/README.md](Docs/README.md) | Documentation Index | Full index with cross-reference map and reading order |
| [FAQ.md](FAQ.md) | FAQ | Common questions: mobile access, llama.cpp setup, IP discovery |
| [BENCHMARK.md](BENCHMARK.md) | Benchmarks | Performance benchmarks: GPU, CPU, MTP, ingestion, search |

---

## Architecture

Chac uses a **microkernel architecture** with dependency injection. A minimal kernel manages module lifecycle and service registration. Each feature is a self-contained module.

```
┌─────────────────────────────────────────────────────┐
│                    USB Flash Drive                    │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   start.sh   │  │  start.bat   │  │ start.cmd │ │
│  └──────┬───────┘  └──────┬───────┘  └─────┬─────┘ │
│         └────────────┬────┘─────────────────┘        │
│              ┌───────▼────────┐                      │
│              │  chac-{os-arch}│  ← Bun executable    │
│              └───────┬────────┘                      │
│         ┌────────────┼────────────┐                  │
│   ┌─────▼─────┐ ┌───▼───┐ ┌────▼─────┐            │
│   │ Hono HTTP │ │ Kernel│ │ SQLite   │            │
│   │  Server   │ │  (DI) │ │ Database │            │
│   └─────┬─────┘ └───┬───┘ └──────────┘            │
│   ┌─────▼─────┐ ┌───▼──────────────────┐           │
│   │ Frontend  │ │     Modules           │           │
│   │ (HTML/CSS │ │ Chat │ Wiki │ Documents │           │
│   │  /JS)     │ │ Memory │ LLM │ Settings │ Router │          │
│   └───────────┘ └──────────┬───────────┘           │
│                   ┌────────▼────────┐               │
│                   │   llama.cpp     │               │
│                   └─────────────────┘               │
└─────────────────────────────────────────────────────┘
```

### Design Principles

| Principle | How It's Applied |
|-----------|-----------------|
| **DRY** | Single schema file, single platform detector, single path resolver |
| **SSOT** | Settings table = config source of truth. `schema.sql` = data shape source of truth |
| **Microkernel** | Kernel handles lifecycle and DI. No business logic in kernel |
| **Modularity** | Each module has its own service + types. Communication via DI container |
| **Portability** | All paths resolve relative to executable or CWD. Zero system dependencies |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Bun | Single-file executables via `--compile`, built-in SQLite |
| **Language** | TypeScript | Type safety, compiles to single executable |
| **Web Framework** | Hono | ~14KB, Web Standards-based |
| **Database** | `bun:sqlite` | Built-in, zero deps, WAL mode |
| **Frontend** | Vanilla HTML/CSS/JS + marked + DOMPurify | Zero build step, markdown rendering, XSS protection |
| **LLM Backend** | llama.cpp | OpenAI-compatible API, cross-platform |
| **Testing** | `bun test` | Bun-native test runner, Vitest-compatible API |

---

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime installed
- Node.js 18+ (for type definitions)

### Install & Run

```bash
git clone <repo-url> chac
cd chac
bun install
bun run dev
```

Open `http://localhost:3000` in your browser.

### What You Get (Dev Mode)

When `llama.cpp` binaries aren't available, Chac runs in **dev mode** with mock LLM responses. This lets you test the full flow without downloading 1.7GB of AI models.

---

## Project Structure

```
chac/
├── src/
│   ├── main.ts                          # Entry point — boots kernel, starts server
│   ├── kernel/
│   │   ├── index.ts                     # Kernel: module registry, lifecycle, DI
│   │   └── types.ts                     # Module contract (interface)
│   ├── database/
│   │   ├── index.ts                     # DB connection, WAL mode, foreign keys
│   │   ├── schema.sql                   # Single source of truth for all tables
│   │   └── migrations.ts                # Version-tracked migration runner
│   ├── platform/
│   │   ├── detect.ts                    # OS/arch detection (SSOT)
│   │   ├── paths.ts                     # Portable path resolution
│   │   └── binaries.ts                  # External binary loader (llama.cpp)
│   ├── modules/
│   │   ├── settings/
│   │   │   ├── service.ts               # Settings CRUD (SSOT: settings table)
│   │   │   └── types.ts                 # Setting defaults and types
│   │   ├── llm/
│   │   │   ├── service.ts               # Process manager + mock fallback
│   │   │   └── types.ts                 # LLM service interface
│   │   ├── documents/
│   │   │   ├── service.ts               # Ingest, chunk, embed, search
│   │   │   └── types.ts                 # Document and search result types
│   │   ├── wiki/
│   │   │   ├── service.ts               # Wiki compilation (Karpathy Method)
│   │   │   └── types.ts                 # Wiki page types
│   │   ├── chat/
│   │   │   ├── service.ts               # Chat sessions, ranked fusion retrieval
│   │   │   └── types.ts                 # Chat session and message types
│   │   ├── memory/
│   │   │   ├── service.ts               # Cross-session memory, extraction
│   │   │   └── types.ts                 # Memory entry types
│   │   └── router/
│   │       ├── index.ts                 # Hono app setup
│   │       ├── api.ts                   # All API route definitions
│   │       └── static.ts               # Frontend asset serving
│   ├── public/
│   │   ├── index.html                   # Main HTML (tabs: Chat, Documents, Wiki, Settings)
│   │   ├── styles.css                   # CSS with dark mode via prefers-color-scheme
│   │   └── app.js                       # Frontend JavaScript
│   └── utils/
│       ├── chunking.ts                  # Text chunking (character + semantic modes)
│       ├── vector.ts                    # Cosine similarity, BLOB conversion
│       ├── vector-index.ts              # HNSW approximate nearest neighbor search
│       ├── hash.ts                      # SHA-256 content hashing
│       └── id.ts                        # UUID generation
├── tests/
│   ├── unit/                            # 158 tests across 21 files
│   ├── integration/                     # Document ingest integration tests
│   ├── e2e/                             # End-to-end tests (excluded by default)
│   ├── mocks/                           # Mock LLM for testing
│   └── helpers/                         # Test setup utilities
├── launchers/                           # USB drive launcher scripts
├── build.ts                             # Cross-compilation build script
└── package.json
```

---

## How It Works

### Karpathy Method

Chac implements the Karpathy Method for document-based Q&A:

```
1. Add Documents     → Ingest text files
2. Compile Wiki      → LLM synthesizes documents into structured wiki entries
3. Query Wiki        → Ask questions; retrieval finds relevant wiki entries first,
                       falls back to raw document chunks if needed
```

### Document Ingestion Pipeline

```
User selects file
  → Read file content
  → Compute SHA-256 hash (dedup check)
  → If hash exists → skip (already ingested)
  → Split into chunks (character-based or semantic, configurable)
  → For each chunk:
    → Call embed server (POST /v1/embeddings)
    → Store chunk + embedding BLOB in DB
  → Update document.chunk_count
```

### Wiki Compilation

```
User clicks "Compile Wiki"
  → For each document:
    → Get all chunks for document
    → Concatenate content (limit 4000 chars)
    → LLM synthesizes structured wiki entry (single-pass or multi-agent, configurable)
    → Generate embedding for wiki content
    → Store in wiki_pages table
  → Cross-document synthesis pass (clusters related pages)
```

### Ranked Fusion Retrieval (Chat Query)

```
User sends message
  → Embed query via embed server

  Simultaneous search:
  → Wiki entries: cosine similarity (threshold 0.3)
  → Raw chunks: cosine similarity (top 5)

  Reciprocal Rank Fusion (K=60):
  → Score = Σ(1 / (K + rank)) across both sources
  → Merge, deduplicate, sort by fused score
  → Top results → system prompt

  Token-aware context budget:
  → Reserve 30% for response
  → Fill history (newest first) until budget exhausted
  → Fill RAG context (highest score first)

  → Stream response via chat server
  → Save message + context chunks to DB
  → Extract user memory (cross-session)
  → Compound knowledge into wiki (if enabled)
```

---

## API Reference

### Base URL

```
http://localhost:3000
```

### Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Health check |

### Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/settings` | Get all settings |
| `PUT` | `/api/settings` | Update a setting |

**PUT body:**
```json
{ "key": "llm.chat.temperature", "value": 0.8 }
```

### Documents

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/documents?page=1&per_page=20` | List documents (paginated) |
| `GET` | `/api/documents/:id` | Get document by ID |
| `POST` | `/api/documents` | Ingest a document |
| `DELETE` | `/api/documents/:id` | Delete a document |
| `POST` | `/api/documents/search` | Search documents by vector similarity |

**POST /api/documents body:**
```json
{ "path": "/path/to/file.txt" }
```

**POST /api/documents/search body:**
```json
{ "query": "machine learning", "limit": 5 }
```

### Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/chat/sessions` | List chat sessions (sorted by order) |
| `POST` | `/api/chat/sessions` | Create a chat session |
| `PUT` | `/api/chat/sessions/:id` | Update session title |
| `PUT` | `/api/chat/sessions` | Reorder sessions |
| `DELETE` | `/api/chat/sessions/:id` | Delete a session and its messages |
| `GET` | `/api/chat/sessions/:id/messages` | Get messages for a session |
| `POST` | `/api/chat` | Send a message (returns response) |

**POST /api/chat/sessions body:**
```json
{ "title": "Research Q&A", "systemPrompt": "You are a helpful assistant" }
```

**POST /api/chat body:**
```json
{ "sessionId": "uuid-here", "message": "What is machine learning?" }
```

### Wiki

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/wiki?page=1&per_page=20` | List wiki pages |
| `GET` | `/api/wiki/:id` | Get wiki page by ID |
| `POST` | `/api/wiki/compile` | Compile wiki from documents |
| `DELETE` | `/api/wiki/:id` | Delete a wiki page |
| `POST` | `/api/wiki/search` | Search wiki pages by vector similarity |

**POST /api/wiki/search body:**
```json
{ "query": "neural networks", "limit": 3 }
```

### LLM

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/llm/status` | Get LLM process status |

### Memory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/memory` | List all memory entries |
| `PUT` | `/api/memory` | Create/update memory entry |
| `DELETE` | `/api/memory/:id` | Delete a memory entry |

**PUT /api/memory body:**
```json
{ "category": "preference", "key": "language", "value": "English" }
```

---

## Database Schema

**Single source of truth:** `src/database/schema.sql`

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `documents` | Ingested source files | `id`, `title`, `content_hash` (dedup), `chunk_count` |
| `chunks` | Text segments + embeddings | `document_id`, `content`, `embedding` (BLOB) |
| `chat_sessions` | Conversation groups | `id`, `title`, `system_prompt`, `sort_order` |
| `chat_messages` | Individual messages | `session_id`, `role`, `content`, `context_chunks` (JSON) |
| `wiki_pages` | LLM-synthesized entries | `id`, `title`, `slug`, `content`, `embedding` (BLOB) |
| `settings` | App configuration | `key`, `value` (JSON), `category` |
| `document_tags` | Many-to-many tags | `document_id`, `tag` |
| `usage_log` | Monitoring | `event_type`, `tokens_used`, `latency_ms` |
| `user_memory` | Cross-session memory | `category`, `key`, `value`, `source`, `confidence` |

### SQLite PRAGMAs (set in code)

```sql
PRAGMA journal_mode = WAL;        -- Concurrent reads during writes
PRAGMA synchronous = NORMAL;      -- USB flash performance
PRAGMA foreign_keys = ON;         -- Referential integrity
PRAGMA busy_timeout = 5000;       -- USB latency tolerance
```

---

## Configuration

All settings are stored in the `settings` table and accessible via the API.

### Default Settings

| Key | Default | Category | Description |
|-----|---------|----------|-------------|
| `llm.chat.model` | `"openbmb/MiniCPM5-1B"` | llm | Chat model name |
| `llm.chat.ctx_size` | `4096` | llm | Context window size |
| `llm.chat.temperature` | `0.7` | llm | Sampling temperature |
| `llm.chat.threads` | `4` | llm | CPU threads for inference |
| `llm.embed.model` | `"nomic-ai/nomic-embed-text-v2-moe"` | llm | Embedding model name |
| `llm.embed.dimensions` | `768` | llm | Embedding vector dimensions |
| `llm.vision.model` | `"openbmb/MiniCPM-V-4.6"` | llm | Vision model name |
| `llm.gpu.layers` | `20` | llm | GPU layers to offload (0=CPU, -1=all) |
| `llm.gpu.flash_attn` | `"on"` | llm | Flash Attention: on, off, auto |
| `llm.gpu.split_mode` | `"none"` | llm | GPU split: none, layer, row, tensor |
| `llm.mtp.enabled` | `false` | llm | Multi-Token Prediction (model must support MTP) |
| `llm.mtp.draft_ngl` | `10` | llm | GPU layers for MTP draft model |
| `rag.chunk_size` | `500` | rag | Target chunk size (chars) |
| `rag.chunk_overlap` | `100` | rag | Overlap between chunks |
| `rag.chunk_mode` | `"character"` | rag | Chunking mode: character, semantic |
| `rag.wiki_threshold` | `0.3` | rag | Min similarity for wiki match |
| `rag.max_chunks` | `5` | rag | Max chunks for LLM context |
| `rag.max_wiki_chars` | `4000` | rag | Max chars for wiki synthesis input |
| `rag.wiki_synthesis_threshold` | `0.6` | rag | Min similarity for cross-doc synthesis |
| `rag.auto_compound` | `false` | rag | Auto-feedback answers into wiki |
| `wiki.agents_enabled` | `false` | rag | Multi-agent wiki compilation |
| `memory.enabled` | `true` | memory | Cross-session memory |
| `llm.chat.ctx_size.auto` | `true` | llm | Auto-detect context size from model |
| `ui.dark_mode` | `"system"` | ui | "system", "light", or "dark" |
| `ui.documents_per_page` | `20` | ui | Pagination size |
| `server.port` | `3000` | server | HTTP server port |
| `server.host` | `"127.0.0.1"` | server | HTTP server bind address |

### Update a Setting

```bash
curl -X PUT http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "llm.chat.temperature", "value": 0.9}'
```

---

## Development

### Commands

```bash
bun run dev          # Start dev server with hot reload
bun test             # Run all tests
bun run test:watch   # Run tests in watch mode
bun run test:coverage # Run tests with coverage report
bun run build        # Cross-compile for all platforms
```

### Dev Mode

When `llama.cpp` binaries aren't found in `bin/llama.cpp/`, Chac automatically enters **dev mode**:

- Mock LLM returns deterministic responses
- Mock embeddings are generated from content
- All features work without downloading models
- Server logs: `⚠️ Dev mode: llama.cpp not found. Using mock LLM responses.`

### Adding a New Module

1. Create `src/modules/{name}/service.ts` and `types.ts`
2. Implement the service class
3. Register in `src/main.ts` via `kernel.provide("token", service)`
4. Add API routes in `src/modules/router/api.ts`
5. Add tests in `tests/unit/modules/{name}.test.ts`

### Module Contract

```typescript
interface Module {
  name: string;
  init(kernel: Kernel): Promise<void>;
  start?(): Promise<void>;
  stop?(): Promise<void>;
}

interface Kernel {
  register(module: Module): void;
  get<T>(token: string): T;
  provide<T>(token: string, value: T): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

---

## Testing

### Test Structure

```
tests/
├── unit/                      # One test file per source file
│   ├── kernel.test.ts
│   ├── database/migrations.test.ts
│   ├── modules/settings.test.ts
│   ├── modules/settings-api.test.ts
│   ├── modules/chat.test.ts
│   ├── modules/chat-context.test.ts
│   ├── modules/wiki.test.ts
│   ├── modules/api-routes.test.ts
│   ├── platform/detect.test.ts
│   ├── platform/paths.test.ts
│   └── utils/{chunking,vector,hash}.test.ts
├── integration/               # Cross-module with real DB
│   └── documents-ingest.test.ts
├── e2e/                       # End-to-end (excluded by default)
│   └── app.test.ts
├── mocks/
│   └── llama-cpp.ts           # Mock LLM for unit tests
└── helpers/
    └── setup.ts               # Test kernel with in-memory DB + mock LLM
```

### Running Tests

```bash
bun test                      # Run all unit + integration tests
bun test tests/unit/          # Unit tests only
bun test tests/integration/   # Integration tests only
```

### Writing Tests

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createTestKernel } from "../helpers/setup";
import { SettingsService } from "../../src/modules/settings/service";

let kernel: ReturnType<typeof createTestKernel>;
let settings: SettingsService;

beforeEach(() => {
  kernel = createTestKernel();
  settings = kernel.get("settings");
});

afterEach(() => {
  kernel.get<{ close: () => void }>("db").close();
});

describe("SettingsService", () => {
  it("gets a setting by key", () => {
    expect(settings.get("llm.chat.temperature")).toBe(0.7);
  });
});
```

---

## Build & Deployment

### Cross-Compilation

```bash
bun run build
```

This builds executables for 8 targets:

| Target | Platform |
|--------|----------|
| `chac-linux-x64` | Linux x86_64 |
| `chac-linux-x64-baseline` | Linux x86_64 (older CPUs) |
| `chac-linux-arm64` | Linux ARM64 |
| `chac-darwin-arm64` | macOS Apple Silicon |
| `chac-darwin-x64` | macOS Intel |
| `chac-darwin-x64-baseline` | macOS Intel (older CPUs) |
| `chac-windows-x64.exe` | Windows x86_64 |
| `chac-windows-x64-baseline.exe` | Windows x86_64 (older CPUs) |

### Output

Executables are placed in `usb-drive/bin/`.

---

## USB Drive Setup

### Structure

```
usb-drive/
├── bin/
│   ├── chac                           # Compiled Bun executables
│   ├── chac-linux-x64
│   ├── chac-linux-x64-baseline
│   ├── chac-linux-arm64
│   ├── chac-darwin-arm64
│   ├── chac-darwin-x64
│   ├── chac-darwin-x64-baseline
│   ├── chac-windows-x64.exe
│   ├── chac-windows-x64-baseline.exe
│   └── llama.cpp/
│       └── llama-server/              # Platform-specific llama.cpp binaries
│           ├── linux-x64/
│           ├── linux-arm64/
│           ├── darwin-arm64/
│           ├── darwin-x64/
│           └── windows-x64/
├── launchers/
│   ├── start.bat                      # Windows launcher
│   ├── start.command                  # macOS launcher (double-clickable)
│   └── start.sh                       # Linux launcher
├── setup/
│   ├── install.sh                     # Unix installer
│   ├── install.bat                    # Windows installer
│   ├── download-llama.sh              # Download llama.cpp binaries
│   ├── download-models.sh             # Download AI models (Unix)
│   ├── download-models.bat            # Download AI models (Windows)
│   └── setup-all.sh                   # Full setup (install + download)
├── data/                              # Runtime data (created on first run)
├── models/                            # AI models (download via setup/download-models.sh)
│   ├── chat.gguf                      # ~1.7 GB
│   ├── embed.gguf                     # ~130 MB
│   └── vision.gguf                    # ~505 MB
├── README.txt                         # Quick start guide
└── .gitignore
```

### Launcher Scripts

**Linux** (`start.sh`):
```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
  exec "$SCRIPT_DIR/bin/chac-linux-x64"
elif [ "$ARCH" = "aarch64" ]; then
  exec "$SCRIPT_DIR/bin/chac-linux-arm64"
fi
```

**macOS** (`start.command`):
```bash
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
  exec "$SCRIPT_DIR/bin/chac-darwin-arm64"
elif [ "$ARCH" = "x86_64" ]; then
  exec "$SCRIPT_DIR/bin/chac-darwin-x64"
fi
```

**Windows** (`start.bat`):
```batch
@echo off
set SCRIPT_DIR=%~dp0
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
  "%SCRIPT_DIR%bin\chac-windows-x64.exe"
)
```

### Adding llama.cpp

1. Download pre-built `llama-server` binaries for each platform
2. Place in `usb-drive/bin/llama.cpp/{platform}/`
3. Ensure binaries are executable (`chmod +x` on Unix)

### Adding Models

1. Download GGUF models
2. Place in `usb-drive/models/`
3. Required: `chat.gguf` and `embed.gguf`

---

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| "Port already in use" | Another instance running | Kill existing process or change port in settings |
| "Embedding server not running" | llama.cpp failed to start | Check `bin/llama.cpp/{platform}/` exists and is executable |
| "Model not found" | Models not downloaded | Run first-time setup, check `models/` directory |
| "Database is locked" | USB ejected during write | Restart app, SQLite will recover via WAL |
| Slow performance | USB 2.0 drive | Use USB 3.0+ drive for faster I/O |
| "Command not found" | Launcher script not executable | Run `chmod +x start.sh` (Linux/macOS) |
| "No binary found for llama.cpp" | llama.cpp not installed | App runs in dev mode with mock LLM |
| `blob.readFloatLE is not a function` | Bun SQLite returns Uint8Array | Already fixed in `src/utils/vector.ts` |

---

## License

MIT
