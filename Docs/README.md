# Chac Documentation Index

Technical reference docs for the Chac project. Each doc covers a distinct topic with cross-references to related docs.

## Documents

| Doc | Topic | Lines | Description |
|-----|-------|-------|-------------|
| [Karpathy.md](./Karpathy.md) | The Karpathy Method | ~500 | Core RAG pipeline: ingest → compile wiki → query with two-tier retrieval |
| [MoE.md](./MoE.md) | Mixture of Experts | ~550 | MoE architecture, routing, load balancing, and modern variants (2025–2026) |
| [Swarm.md](./Swarm.md) | Swarm Intelligence | ~480 | Swarm algorithms, LLM-based multi-agent systems, and governance |
| [Sub-quadratic.md](./Sub-quadratic.md) | Sub-Quadratic Attention | ~610 | Linear attention, SSMs, sparse attention, and alternatives to O(n²) |

## Project Docs

| Doc | Location | Description |
|-----|----------|-------------|
| [README.md](../README.md) | Project root | Architecture, API reference, database schema, configuration, build |
| [FAQ.md](../FAQ.md) | Project root | Common questions: mobile access, llama.cpp setup, IP discovery |
| [BENCHMARK.md](../BENCHMARK.md) | Project root | Performance benchmarks: GPU, CPU, MTP, ingestion, search |

## Cross-Reference Map

```
Karpathy ←→ MoE        (nomic-embed-text-v2-moe is an MoE model)
Karpathy ←→ Swarm      (future multi-agent document processing)
Karpathy ←→ Sub-quad   (sub-quadratic models could replace current LLM)
MoE      ←→ Sub-quad   (MoE + linear attention = efficient scaling)
Swarm    ←→ Sub-quad   (diverse architectures prevent consensus paradox)
```

## Reading Order

For a new reader, the recommended order is:

1. **README.md** — project overview and architecture
2. **Karpathy.md** — the core method Chac implements
3. **MoE.md** — why the embedding model is efficient
4. **Sub-quadratic.md** — future model architectures
5. **Swarm.md** — advanced multi-agent extensions
