# Chac Documentation Index

Technical reference docs for the Chac project. Each doc covers a distinct topic with cross-references to related docs.

## Documents

| Doc | Topic | Lines | Description |
|-----|-------|-------|-------------|
| [Karpathy.md](./Karpathy.md) | The Karpathy Method | ~500 | Core RAG pipeline: ingest → compile wiki → query with two-tier retrieval |
| [MoE.md](./MoE.md) | Mixture of Experts | ~550 | MoE architecture, routing, load balancing, and modern variants (2025–2026) |
| [Swarm.md](./Swarm.md) | Swarm Intelligence | ~480 | Swarm algorithms, LLM-based multi-agent systems, and governance |
| [Sub-quadratic.md](./Sub-quadratic.md) | Sub-Quadratic Attention | ~615 | Linear attention, SSMs, sparse attention, and alternatives to O(n²) |
| [Subq.md](./Subq.md) | SubQ-1.1-Small | ~350 | SubQ model card: SSA mechanism, training, results, and implications |
| [SSA.md](./SSA.md) | SSA Deep-Dive | ~300 | Technical analysis of Subquadratic Sparse Attention mechanism |
| [MLA.md](./MLA.md) | MLA Deep-Dive | ~300 | Multi-Head Latent Attention: KV cache compression via low-rank decomposition |
| [GPT.md](./GPT.md) | GPT Architecture | ~300 | Generative Pre-trained Transformer: decoder-only architecture, scaling, and evolution |

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
Karpathy ←→ GPT        (Chac uses GPT-based models via llama.cpp)
MoE      ←→ Sub-quad   (MoE + linear attention = efficient scaling)
MoE      ←→ MLA        (DeepSeek V3 uses MLA + MoE together)
MoE      ←→ GPT        (MoE extends GPT architecture with expert routing)
Swarm    ←→ Sub-quad   (diverse architectures prevent consensus paradox)
Subq     ←→ SSA        (SSA is the attention mechanism behind SubQ-1.1-Small)
Subq     ←→ Sub-quad   (SubQ-1.1-Small is a concrete instance of sub-quadratic attention)
SSA      ←→ Sub-quad   (SSA is a specific sparse-attention approach)
SSA      ←→ GPT        (SSA replaces GPT's O(n²) attention)
MLA      ←→ Sub-quad   (MLA compresses KV cache; sub-quadratic reduces compute)
MLA      ←→ SSA        (complementary: MLA = memory, SSA = compute)
MLA      ←→ GPT        (MLA compresses GPT's KV cache)
GPT      ←→ Sub-quad   (sub-quadratic methods address GPT's quadratic bottleneck)
```

## Reading Order

For a new reader, the recommended order is:

1. **README.md** — project overview and architecture
2. **GPT.md** — the transformer decoder architecture underlying all modern LLMs
3. **Karpathy.md** — the core method Chac implements
4. **MoE.md** — why the embedding model is efficient
5. **MLA.md** — KV cache compression for large models
6. **Sub-quadratic.md** — future model architectures
7. **Subq.md** — SubQ-1.1-Small model card and results
8. **SSA.md** — technical deep-dive into the SSA mechanism
9. **Swarm.md** — advanced multi-agent extensions
