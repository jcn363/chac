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
| [ObsidianSA.md](./ObsidianSA.md) | Obsidian Vault Philosophy | ~280 | Steph Ango's vault structure, linking philosophy, and knowledge management principles |
| [Dspark.md](./Dspark.md) | DSpark Speculative Decoding | ~300 | DeepSeek's DSpark framework: semi-autoregressive drafting, confidence-scheduled verification, 60–85% inference speedup |
| [Fugu.md](./Fugu.md) | Sakana Fugu Multi-Agent Orchestration | ~350 | Fugu: learned LLM coordinator that dynamically orchestrates frontier models via TRINITY and Conductor (ICLR 2026) |
| [cpuram.md](./cpuram.md) | CPU+RAM Inference Optimization | ~450 | Running LLMs on CPU: quantization, threading, mmap, memory architecture, and practical tuning |
| [gguf.md](./gguf.md) | GGUF Model File Format | ~550 | GGUF specification: file structure, metadata, quantization types, naming, conversion, and Chac integration |

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
Karpathy ←→ MLA        (MLA enables longer context for RAG pipelines)
Karpathy ←→ ObsidianSA (both use bottom-up knowledge organization)
MoE      ←→ Sub-quad   (MoE + linear attention = efficient scaling)
MoE      ←→ MLA        (DeepSeek V3 uses MLA + MoE together)
MoE      ←→ GPT        (MoE extends GPT architecture with expert routing)
MoE      ←→ DSpark     (DeepSeek-V4 uses MoE; DSpark accelerates its inference)
MoE      ←→ ObsidianSA (both optimize resource allocation via specialization)
Swarm    ←→ Sub-quad   (diverse architectures prevent consensus paradox)
Swarm    ←→ MLA        (swarm agents benefit from KV cache compression)
Swarm    ←→ ObsidianSA (fractal review parallels multi-agent knowledge maintenance)
Subq     ←→ SSA        (SSA is the attention mechanism behind SubQ-1.1-Small)
Subq     ←→ Sub-quad   (SubQ-1.1-Small is a concrete instance of sub-quadratic attention)
Subq     ←→ DSpark     (speculative decoding can accelerate SSA-based models)
SSA      ←→ Sub-quad   (SSA is a specific sparse-attention approach)
SSA      ←→ GPT        (SSA replaces GPT's O(n²) attention)
SSA      ←→ DSpark     (DSpark can draft for SSA-based target models)
MLA      ←→ Sub-quad   (MLA compresses KV cache; sub-quadratic reduces compute)
MLA      ←→ SSA        (complementary: MLA = memory, SSA = compute)
MLA      ←→ GPT        (MLA compresses GPT's KV cache)
MLA      ←→ DSpark     (DSpark reduces verification waste on MLA-compressed models)
GPT      ←→ Sub-quad   (sub-quadratic methods address GPT's quadratic bottleneck)
GPT      ←→ DSpark     (DSpark accelerates GPT-based model inference)
ObsidianSA ←→ Karpathy  (both use bottom-up knowledge organization: wiki compilation ↔ linking philosophy)
ObsidianSA ←→ Swarm     (fractal review parallels multi-agent knowledge maintenance)
ObsidianSA ←→ MoE       (both optimize resource allocation via specialization)
DSpark     ←→ MoE       (DeepSeek-V4 uses MoE architecture; DSpark accelerates its inference)
DSpark     ←→ MLA       (V4 uses MLA for KV cache compression; DSpark reduces verification waste)
DSpark     ←→ Sub-quad  (speculative decoding complements sub-quadratic attention for speed)
DSpark     ←→ GPT       (DSpark accelerates GPT-based model inference)
Fugu       ←→ Swarm     (Fugu's multi-agent orchestration is a learned form of swarm coordination)
Fugu       ←→ MoE       (Fugu routes across model pools; MoE routes across expert networks)
Fugu       ←→ Karpathy  (Fugu could enhance Chac's multi-agent wiki synthesis and RAG routing)
Fugu       ←→ DSpark    (speculative decoding could accelerate Fugu's individual agent inference)
cpuram     ←→ Karpathy  (Chac's portable design requires CPU-optimized inference for USB deployment)
cpuram     ←→ MLA       (MLA compresses KV cache — directly impacts CPU memory budget)
cpuram     ←→ DSpark    (speculative decoding can double CPU inference speed)
cpuram     ←→ Sub-quad  (sub-quadratic attention reduces compute — beneficial for CPU bound systems)
cpuram     ←→ GPT       (GPT architecture determines memory/compute profile on CPU)
gguf       ←→ cpuram    (GGUF quantization type determines CPU memory and speed)
gguf       ←→ Karpathy  (Chac ingests GGUF models for local RAG inference)
gguf       ←→ MoE       (GGUF stores MoE expert weights with routing metadata)
gguf       ←→ MLA       (GGUF metadata encodes MLA KV compression parameters)
gguf       ←→ GPT       (GGUF contains transformer architecture metadata)
gguf       ←→ DSpark    (GGUF MTP sidecar enables speculative decoding draft models)
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
10. **ObsidianSA.md** — knowledge management philosophy (optional, for understanding organizational principles)
11. **Dspark.md** — inference optimization via speculative decoding (optional, for understanding serving efficiency)
12. **Fugu.md** — multi-agent orchestration as a single model (optional, for understanding learned coordination)
13. **cpuram.md** — CPU and RAM inference optimization (essential for Chac's portable USB deployment)
14. **gguf.md** — GGUF model file format: structure, metadata, quantization, and conversion (essential for understanding Chac's model files)
