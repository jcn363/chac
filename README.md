# Chac

> Portable RAG (Retrieval-Augmented Generation) chat for Linux, macOS, Windows.
> All processing is local — no cloud dependencies. Runs `llama.cpp` via USB drive.
> Follows the Karpathy Method: organize raw documents, compile them into a wiki, then query the wiki for answers.

## Table of Contents

- [Features](#features)
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

---

## Features

- **RAG Chat** — ask questions grounded in your documents
- **Wiki (Karpathy Method)** — compile documents into structured wiki entries using LLM
- **Two-Tier Retrieval** — query wiki entries first, fall back to raw chunks
- **Portable & Cross-Platform** — runs on any OS via USB drive (Windows, macOS, Linux)
- **Document Ingestion** — chunk, embed, and store any text file
- **Vector Search** — cosine similarity over stored embeddings
- **Streaming Responses** — real-time streaming from `llama.cpp`
- **Document Management** — search, sort, rename, delete, bulk operations
- **Dark Mode** — follows system theme automatically
- **Dev Mode** — mock LLM responses for development without `llama.cpp`

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
│   │ (HTML/CSS │ │  Chat │ Wiki │ Docs  │           │
│   │  /JS)     │ │  LLM  │ Settings│Router│          │
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
| **Frontend** | Vanilla HTML/CSS/JS | Zero build step, embedded via Bun HTML imports |
| **LLM Backend** | llama.cpp | OpenAI-compatible API, cross-platform |
| **Testing** | Vitest | Fast, Bun-native |

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
│   │   ├── migrations.ts                # Version-tracked migration runner
│   │   └── types.ts                     # DB row types
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
│   │   │   ├── service.ts               # Chat sessions, two-tier retrieval
│   │   │   └── types.ts                 # Chat session and message types
│   │   └── router/
│   │       ├── index.ts                 # Hono app setup
│   │       ├── api.ts                   # All API route definitions
│   │       └── static.ts               # Frontend asset serving
│   ├── public/
│   │   ├── index.html                   # Main HTML (tabs: Chat, Docs, Wiki, Settings)
│   │   ├── styles.css                   # CSS with dark mode via prefers-color-scheme
│   │   └── app.ts                       # Frontend JavaScript
│   └── utils/
│       ├── chunking.ts                  # Text chunking (500 chars, 100 overlap)
│       ├── vector.ts                    # Cosine similarity, BLOB conversion
│       ├── hash.ts                      # SHA-256 content hashing
│       └── id.ts                        # UUID generation
├── tests/
│   ├── unit/                            # 44 tests across 10 files
│   ├── integration/                     # Document ingest integration tests
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
1. Add Documents     → Ingest text files, PDFs, audio, video
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
  → Split into 500-char chunks (100-char overlap)
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
    → LLM synthesizes structured wiki entry
    → Generate embedding for wiki content
    → Store in wiki_pages table
```

### Two-Tier Retrieval (Chat Query)

```
User sends message
  → Embed query via embed server

  Tier 1: Wiki Entries
  → Load all wiki embeddings
  → Score each by cosine similarity
  → If best score ≥ 0.3 → use wiki entry content

  Tier 2: Raw Chunks (fallback)
  → If no good wiki match:
    → Load all chunk embeddings
    → Score each by cosine similarity
    → Top 5 most relevant → system prompt

  → Build system prompt with context
  → Stream response via chat server
  → Save message + context chunks to DB
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
| `GET` | `/api/chat/sessions` | List chat sessions |
| `POST` | `/api/chat/sessions` | Create a chat session |
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

---

## Database Schema

**Single source of truth:** `src/database/schema.sql`

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `documents` | Ingested source files | `id`, `title`, `content_hash` (dedup), `chunk_count` |
| `chunks` | Text segments + embeddings | `document_id`, `content`, `embedding` (BLOB) |
| `chat_sessions` | Conversation groups | `id`, `title`, `system_prompt` |
| `chat_messages` | Individual messages | `session_id`, `role`, `content`, `context_chunks` (JSON) |
| `wiki_pages` | LLM-synthesized entries | `id`, `title`, `slug`, `content`, `embedding` (BLOB) |
| `settings` | App configuration | `key`, `value` (JSON), `category` |
| `document_tags` | Many-to-many tags | `document_id`, `tag` |
| `usage_log` | Monitoring | `event_type`, `tokens_used`, `latency_ms` |

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
| `llm.chat.model` | `"local"` | llm | Chat model name |
| `llm.chat.ctx_size` | `4096` | llm | Context window size |
| `llm.chat.temperature` | `0.7` | llm | Sampling temperature |
| `llm.chat.threads` | `4` | llm | CPU threads for inference |
| `llm.embed.model` | `"local"` | llm | Embedding model name |
| `llm.embed.dimensions` | `768` | llm | Embedding vector dimensions |
| `rag.chunk_size` | `500` | rag | Target chunk size (chars) |
| `rag.chunk_overlap` | `100` | rag | Overlap between chunks |
| `rag.wiki_threshold` | `0.3` | rag | Min similarity for wiki match |
| `rag.max_chunks` | `5` | rag | Max chunks for LLM context |
| `rag.max_wiki_chars` | `4000` | rag | Max chars for wiki synthesis input |
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
bun test:watch       # Run tests in watch mode
bun test:coverage    # Run tests with coverage report
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
│   ├── database/migrations.test.ts
│   ├── modules/settings.test.ts
│   ├── modules/chat.test.ts
│   ├── modules/wiki.test.ts
│   ├── platform/detect.test.ts
│   ├── platform/paths.test.ts
│   └── utils/{chunking,vector,hash}.test.ts
├── integration/               # Cross-module with real DB
│   └── documents-ingest.test.ts
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
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
├── start.bat               # Windows launcher
├── start.command           # macOS launcher (double-clickable)
├── start.sh                # Linux launcher
├── README.txt              # Setup instructions
├── bin/
│   ├── chac-linux-x64      # Compiled Bun executables
│   ├── chac-darwin-arm64
│   ├── chac-windows-x64.exe
│   └── llama.cpp/          # Platform-specific llama.cpp binaries
│       ├── linux-x64/
│       ├── darwin-arm64/
│       └── windows-x64/
└── models/                 # AI models (auto-downloaded on first run)
    ├── chat.gguf           # ~1.7 GB
    ├── embed.gguf          # ~130 MB
    └── ...
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
