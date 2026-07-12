# The Karpathy Method: A Personal LLM That Knows Everything

> "The best way to predict the future is to build it." — Andrej Karpathy

**See also:** [Mixture of Experts](./MoE.md) · [Swarm Intelligence](./Swarm.md) · [Sub-Quadratic Attention](./Sub-quadratic.md) · [MLA Deep-Dive](./MLA.md) · [GPT Architecture](./GPT.md) · [ObsidianSA](./ObsidianSA.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Who is Andrej Karpathy](#who-is-andrej-karpathy)
2. [The Karpathy Method Overview](#the-karpathy-method-overview)
3. [The Three-Step Pipeline](#the-three-step-pipeline)
4. [Technical Architecture](#technical-architecture)
5. [How It Differs from Traditional RAG](#how-it-differs-from-traditional-rag)
6. [Wiki Compilation: The Key Innovation](#wiki-compilation-the-key-innovation)
7. [Two-Tier Retrieval](#two-tier-retrieval)
8. [Implementation Details](#implementation-details)
9. [Applications and Use Cases](#applications-and-use-cases)
10. [The Chac Implementation](#the-chac-implementation)
11. [Related Work](#related-work)
12. [References](#references)

---

## Who is Andrej Karpathy

Andrej Karpathy is an AI researcher and educator who has been at the forefront of deep learning for over a decade:

- **Founding member of OpenAI** (2015–2017, 2023–2024)
- **Director of AI at Tesla** (2017–2022), leading Autopilot computer vision
- **Creator of CS231n** — Stanford's first deep learning course, which grew from 150 to 750 students
- **Prolific educator** — YouTube channel with millions of views on LLMs and AI
- **Builder** — micrograd, char-rnn, arxiv-sanity, neuraltalk2, ConvNetJS

His approach to AI is characterized by building things from first principles, starting simple, and iterating. The Karpathy Method for personal AI follows this same philosophy.

---

## The Karpathy Method Overview

The Karpathy Method is an approach to building a **personal Retrieval-Augmented Generation (RAG) system** that gives a local LLM access to your entire document collection. Unlike traditional RAG, which retrieves raw document chunks, the Karpathy Method adds a **wiki compilation step** that synthesizes documents into structured knowledge entries.

### Core Principle

> Ingest your documents → Compile them into a wiki → Query the wiki for answers

This three-step pipeline transforms raw, unstructured documents into a structured knowledge base that an LLM can reason over effectively.

### Why It Matters

- **No cloud dependencies** — everything runs locally
- **No internet required** — works offline on a USB drive
- **Structured knowledge** — wiki entries are more useful than raw chunks
- **Two-tier retrieval** — tries wiki first, falls back to raw chunks
- **Portable** — runs on any OS, any computer

---

## The Three-Step Pipeline

### Step 1: Document Ingestion

**Input**: Raw documents (text files, PDFs, audio transcripts, video captions)

**Process**:
1. Read the document content
2. Generate a content hash for deduplication
3. Split into chunks (typically 500 characters with 100 character overlap)
4. Generate embeddings for each chunk using an embedding model
5. Store chunks with embeddings in a SQLite database

**Output**: Indexed document chunks with vector embeddings

```
Document → Chunks → Embeddings → SQLite DB
```

**Key parameters**:
- `chunk_size`: Target chunk size in characters (default: 500)
- `chunk_overlap`: Overlap between consecutive chunks (default: 100)
- `embedding_dimensions`: Vector dimensions (default: 768)

### Step 2: Wiki Compilation

**Input**: Indexed document chunks from Step 1

**Process**:
1. For each document, gather all its chunks
2. Concatenate chunks (up to max_wiki_chars limit)
3. Send to LLM with a system prompt to synthesize a wiki entry
4. Generate an embedding for the wiki entry
5. Store the wiki page with its embedding

**Output**: Structured wiki pages with embeddings

```
Chunks → LLM Synthesis → Wiki Page → Embedding → SQLite DB
```

**Key parameters**:
- `max_wiki_chars`: Maximum characters for wiki synthesis (default: 4000)
- LLM system prompt: "You are a wiki compiler. Synthesize the following document into a structured wiki entry. Include: title, key concepts, important facts, and a summary. Format as Markdown."

**Why wiki compilation matters**:
- Wiki entries are **structured and organized** — not just raw text
- They capture **key concepts and relationships** — not just surface content
- They're **concise summaries** — easier for LLMs to reason over
- They can be **versioned and updated** as documents change

### Step 3: Query (Two-Tier Retrieval)

**Input**: User question

**Process**:
1. **Tier 1 — Wiki Search**: Generate embedding for query, search wiki pages by cosine similarity
2. If wiki results exceed threshold → use wiki content as context
3. **Tier 2 — Chunk Search**: If no good wiki matches, search raw chunks by cosine similarity
4. Build context from retrieved results
5. Send context + question to LLM for answer generation

**Output**: Grounded answer with source attribution

```
Question → Embedding → Wiki Search → (if good) → Wiki Context
                                           ↓ (if not)
                                     Chunk Search → Chunk Context
                                           ↓
                                     LLM Generation → Answer
```

**Key parameters** (configurable via Settings API):
- `wiki_threshold`: Minimum similarity for wiki match (default: 0.3)
- `max_chunks`: Maximum chunks for LLM context (default: 5)
- `max_wiki_chars`: Maximum chars for wiki synthesis input (default: 4000)

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────┐
│                    Chac Application                  │
├─────────────┬─────────────┬─────────────┬───────────┤
│  Documents  │    Wiki     │    Chat     │  Settings │
│  Service    │   Service   │   Service   │  Service  │
├─────────────┴─────────────┴─────────────┴───────────┤
│              Kernel (DI Container)                   │
├─────────────┬─────────────┬─────────────┬───────────┤
│  SQLite DB  │   LLM       │  Embedding  │  Router   │
│  (WAL mode) │  (llama.cpp)│   Model     │  (Hono)   │
└─────────────┴─────────────┴─────────────┴───────────┘
```

### Data Flow

```
User Question
     │
     ▼
┌─────────────┐
│  Chat API   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     ┌─────────────┐
│  Wiki Search │────▶│  Wiki Pages │
└──────┬──────┘     └─────────────┘
       │ (if no match)
       ▼
┌─────────────┐     ┌─────────────┐
│ Chunk Search │────▶│   Chunks    │
└──────┬──────┘     └─────────────┘
       │
       ▼
┌─────────────┐
│  LLM Query  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Answer    │
└─────────────┘
```

### Database Schema

Chac uses SQLite with two key tables for the Karpathy Method: `chunks` (raw document segments with embeddings) and `wiki_pages` (LLM-synthesized entries with embeddings). Full schema is in [`src/database/schema.sql`](../src/database/schema.sql) and documented in the [README](../README.md#database-schema).

---

## How It Differs from Traditional RAG

| Aspect | Traditional RAG | Karpathy Method |
|--------|----------------|-----------------|
| **Retrieval** | Single-tier (raw chunks only) | Two-tier (wiki first, chunks fallback) |
| **Knowledge** | Raw document fragments | Synthesized, structured wiki entries |
| **Context Quality** | May include irrelevant chunks | Focused, organized knowledge |
| **Reasoning** | Limited to chunk content | Can reason over structured concepts |
| **Maintainability** | Chunks are static | Wiki entries can be versioned |
| **Explainability** | Hard to trace sources | Wiki entries have clear provenance |

### The Wiki Advantage

Traditional RAG retrieves raw text chunks. These chunks:
- May be out of context (split mid-sentence)
- Lack structure and organization
- Don't capture relationships between concepts
- Can be verbose and noisy

The Karpathy Method's wiki entries:
- Are structured with titles, key concepts, and summaries
- Capture the essence of documents, not just surface text
- Are organized and coherent
- Are concise and focused

---

## Wiki Compilation: The Key Innovation

### The Compilation Process

```typescript
async compile(): Promise<WikiPage[]> {
  // For each document
  for (const doc of documents) {
    // 1. Gather all chunks
    const chunks = db.query(
      "SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index"
    ).all(doc.id);

    // 2. Concatenate (up to limit)
    const fullContent = chunks.map(c => c.content).join("\n").slice(0, maxChars);

    // 3. LLM synthesis
    const messages = [
      { role: "system", content: "You are a wiki compiler..." },
      { role: "user", content: fullContent }
    ];
    let wikiContent = "";
    for await (const chunk of llm.chat.completions({ messages, stream: true })) {
      wikiContent += chunk;
    }

    // 4. Generate embedding
    const embedding = await llm.embeddings.create({ input: wikiContent });

    // 5. Store wiki page
    // ... insert or update
  }
}
```

### Wiki Entry Structure

A well-compiled wiki entry includes:
- **Title**: Clear, descriptive name
- **Key Concepts**: Main ideas and topics
- **Important Facts**: Critical information
- **Summary**: Concise overview
- **Source References**: Which documents contributed

### Version Control

Wiki entries track their version:
- New documents create new wiki pages
- Updated documents increment the version
- Source document IDs are tracked for provenance

---

## Two-Tier Retrieval

### Why Two Tiers?

The two-tier approach solves a fundamental problem: wiki entries are great for high-level questions, but sometimes you need the specific details that only raw chunks contain.

### Tier 1: Wiki Search

```
Query Embedding → Cosine Similarity with Wiki Embeddings → Filter by Threshold → Rank
```

**Advantages**:
- Structured, organized content
- Captures key concepts and relationships
- More concise and focused
- Better for "what is X?" type questions

### Tier 2: Chunk Search (Fallback)

```
Query Embedding → Cosine Similarity with Chunk Embeddings → Rank → Take Top K
```

**Advantages**:
- Contains full original content
- Better for specific details and quotes
- No information loss from synthesis
- Better for "what does the document say about X?" type questions

### Decision Logic

The current implementation uses **Reciprocal Rank Fusion (RRF)** to merge wiki and chunk results instead of a binary fallback:

```typescript
private async retrieveContextFused(query: string): Promise<ContextChunk[]> {
  const queryVec = await this.embedQuery(searchQuery);

  // Search both wiki and chunks in parallel
  const [wikiResults, chunkResults] = await Promise.all([
    this.wikiIndex.search(db, "wiki_pages", "id", "content", queryVec, { threshold }),
    this.chunkIndex.search(db, "chunks", "id", "content", queryVec, { limit: maxChunks * 3 }),
  ]);

  // Reciprocal Rank Fusion (K=60) merges both result sets
  const scores = new Map<string, ContextChunk>();
  for (let rank = 0; rank < wikiResults.length; rank++) {
    const rrfScore = 1 / (60 + rank + 1);
    scores.set(`wiki:${r.id}`, { chunkId: r.id, content: r.content, score: rrfScore, source: "wiki" });
  }
  for (let rank = 0; rank < chunkResults.length; rank++) {
    const rrfScore = 1 / (60 + rank + 1);
    const existing = scores.get(`chunk:${r.id}`);
    if (existing) existing.score += rrfScore;
    else scores.set(`chunk:${r.id}`, { chunkId: r.id, content: r.content, score: rrfScore, source: "chunk" });
  }

  // Sort by fused score, take top results
  return Array.from(scores.values()).sort((a, b) => b.score - a.score).slice(0, maxChunks);
}
```

This replaces the original binary fallback with a ranked fusion that combines wiki and chunk results by their relative position, weighted by the RRF constant K=60.

---

## Implementation Details

### Embedding Model

The method uses a dedicated embedding model to convert text into vector representations:

- **Model**: nomic-embed-text-v2-moe (768 dimensions)
- **Format**: GGUF (Q4_K_M quantization)
- **Run via**: llama.cpp server with `--embedding` flag

### Chat Model

The method uses a local LLM for synthesis and question answering:

- **Model**: MiniCPM5-1B (1B parameters)
- **Format**: GGUF (Q4_K_M quantization)
- **Run via**: llama.cpp server

### Vector Search

Cosine similarity with a `VectorIndex` that precomputes and caches document norms for efficient batch search:

```typescript
// vector.ts — safety-checked with null fallbacks
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0, bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// vector-index.ts — precomputed norms, O(n) with cached query norm
const index = new VectorIndex();
const results = index.search(db, "chunks", "id", "content", queryVec, { limit: 5, threshold: 0.3 });
```

### Portable Binary

The application compiles to a standalone binary using Bun's `--compile` flag:

```bash
bun build --compile --target=bun-linux-x64 --minify src/main.ts --outfile chac
```

This produces a single executable that includes:
- The Bun runtime
- All application code
- Embedded database schema (no file reads at runtime)

---

## Applications and Use Cases

### Personal Knowledge Management

- Ingest all your notes, documents, articles
- Ask questions across your entire knowledge base
- Find connections between different topics

### Research and Academia

- Ingest research papers, lab notes, textbooks
- Ask questions about your research domain
- Synthesize findings across multiple sources

### Legal and Compliance

- Ingest contracts, regulations, policies
- Ask questions about compliance requirements
- Find specific clauses across documents

### Technical Documentation

- Ingest codebases, API docs, wikis
- Ask questions about system architecture
- Find specific implementations or configurations

### Education

- Ingest textbooks, lecture notes, slides
- Ask questions about course material
- Create study guides from compiled wiki entries

---

## The Chac Implementation

Chac is a complete implementation of the Karpathy Method as a portable USB drive application. It differs from typical RAG projects in three key ways:

1. **Offline-first, zero-install** — the entire stack (LLM, embeddings, database, web server) ships as a single compiled binary. No Docker, no Python, no cloud API keys. Insert USB → double-click launcher → chat.
2. **Dev mode for iteration** — when llama.cpp binaries aren't present, Chac falls back to a mock LLM with deterministic responses. This lets you develop and test the UI, document pipeline, and wiki compilation without downloading 1.7GB of AI models.
3. **Microkernel DI architecture** — a minimal kernel handles module lifecycle and dependency injection. Each feature (Documents, Wiki, Chat, Settings, LLM) is a self-contained module with its own service and types. Adding a new capability means registering a new module — no core changes needed.

### Architecture

- **Microkernel**: Minimal core with DI container
- **Modules**: Documents, Wiki, Chat, Settings, LLM
- **Database**: SQLite with WAL mode (USB-latency tolerant via `busy_timeout = 5000`)
- **Frontend**: Vanilla HTML/CSS/JS (zero build step)
- **Backend**: Hono web framework on Bun (~14KB, Web Standards-based)
- **Runtime**: Bun `--compile` produces a single standalone executable per platform

### Key Features

| Feature | Description |
|---------|-------------|
| **Document Ingestion** | Chunk, embed, and store text files (SHA-256 dedup, batched embeddings) |
| **Wiki Compilation** | LLM synthesizes chunks into structured wiki entries (parallel processing) |
| **Two-Tier Retrieval** | Wiki first, chunks fallback (VectorIndex with precomputed norms) |
| **Streaming Chat** | Real-time SSE streaming from llama.cpp |
| **Vector Search** | O(n) search with cached query norms, invalidation on data changes |
| **Settings Cache** | In-memory cache, no DB hits on repeated reads |
| **Dev Mode** | Mock LLM for testing without models |
| **GPU Acceleration** | CUDA/Metal/Vulkan offloading via settings |
| **Portable** | Single binary, runs from USB on any OS |

### USB Drive Layout

```
chac/
├── bin/chac                    # Compiled binary
├── bin/llama.cpp/              # llama.cpp binaries
├── models/
│   ├── chat.gguf              # Chat model (MiniCPM5-1B)
│   ├── embed.gguf             # Embedding model (nomic-embed-text-v2-moe)
│   └── vision.gguf            # Vision model (MiniCPM-V-4.6)
├── data/chac.db               # SQLite database
├── launchers/                  # OS-specific launchers
└── setup/                      # Setup scripts
```

---

## Related Work

### Knowledge Compounding (2026)

A recent paper analyzed the economic implications of the Karpathy Method:

> "The cost term in the original Agentic ROI equation contains an unexamined assumption — that the cost of each task is mutually independent. This assumption holds under the traditional RAG paradigm but breaks down once a persistent, structured knowledge layer is introduced."

**Key finding**: Under the compounding regime, cumulative token consumption was 47K vs 305K under RAG baseline — a savings of 84.6%.

Three microeconomic mechanisms:
1. **One-time INGEST** amortized over N retrievals
2. **Auto-feedback** of high-value answers into synthesis pages
3. **Write-back** of external search results into entity pages

### OpenClaw / Qing Claw

An industrial-grade C# reimplementation of the multi-agent framework that implements the Karpathy Method (~200 lines). Demonstrates 84.6% token savings over traditional RAG. See [References](#references) for details.

### Swarm Intelligence

Multi-agent coordination is a natural extension of the Karpathy Method. See [Swarm Intelligence in AI](./Swarm.md) for how swarm-based approaches could enhance document processing and retrieval in future Chac versions.

---

## References

1. Karpathy, A. (2025). "How I use LLMs." YouTube.
2. Karpathy, A. (2025). "The append-and-review note." Bear Blog.
3. Karpathy, A. (2025). "The space of minds." Bear Blog.
4. Wen, S. & Ku, B. (2026). "Knowledge Compounding: An Empirical Economic Analysis of Self-Evolving Knowledge Wikis under the Agentic ROI Framework." arXiv:2604.11243.
5. Chac Project. (2026). Portable RAG chat application implementing the Karpathy Method.
6. OpenClaw / Qing Claw. (2026). Industrial-grade C# reimplementation of multi-agent Karpathy Method framework. ~200 lines, demonstrates 84.6% token savings over traditional RAG.

---

## Summary

The Karpathy Method represents a practical, portable approach to personal AI:

1. **Ingest** your documents into a searchable knowledge base
2. **Compile** them into structured wiki entries using LLMs
3. **Query** with two-tier retrieval (wiki first, chunks fallback)

The key innovation is the wiki compilation step, which transforms raw document fragments into structured, organized knowledge that LLMs can reason over more effectively. Combined with local execution and portability, this enables a personal AI that knows everything you've given it — running entirely on a USB drive with no internet connection.
