# Subquadratic Sparse Attention (SSA): Technical Deep-Dive

> "A routing mechanism intended to make long context affordable becomes the dominant long-context cost." — Subversive AI, on DeepSeek's Lightning Indexer

**See also:** [SubQ-1.1-Small](./Subq.md) · [Sub-Quadratic Attention](./Sub-quadratic.md) · [MLA Deep-Dive](./MLA.md) · [GPT Architecture](./GPT.md) · [The Karpathy Method](./Karpathy.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Overview](#overview)
2. [The Problem SSA Solves](#the-problem-ssa-solves)
3. [Design Requirements](#design-requirements)
4. [How SSA Works](#how-ssa-works)
5. [SSA vs Other Sparse Attention](#ssa-vs-other-sparse-attention)
6. [Efficiency Analysis](#efficiency-analysis)
7. [Context-Length Generalization](#context-length-generalization)
8. [Training Findings](#training-findings)
9. [Limitations and Open Questions](#limitations-and-open-questions)
10. [Relevance to Chac](#relevance-to-chac)
11. [References](#references)

---

## Overview

Subquadratic Sparse Attention (SSA) is a content-dependent attention mechanism developed by Subversive AI (2026) that achieves linear compute and memory complexity end-to-end — not just within the attention operation, but across the full selection, retrieval, and attention pipeline. SSA was the attention mechanism behind SubQ-1.1-Small, the first model to demonstrate long-context retrieval generalizing far beyond the training window.

**Key claim**: SSA is not just a faster attention mechanism. It is a research accelerator that makes multi-million-token experimentation practical, enabling the kind of high-variant-count exploration that produces genuine capability breakthroughs.

---

## The Problem SSA Solves

### The Four-Property Gap

Previous long-context approaches each satisfied some but not all of the properties a complete solution requires:

| Property | Dense Attention | Linear/Recurrent | Sparse (NSA) | Hybrid | System (RAG) |
|----------|----------------|------------------|--------------|--------|--------------|
| Content-dependent retrieval | ✓ | ✗ | ✓ | Partial | ✗ (outside model) |
| Subquadratic scaling | ✗ | ✓ | ✓ | Partial | N/A |
| Full-context training | ✓ | ✗ | ✓ | Partial | N/A |
| Autoregressive generation | ✓ | ✓ | ✓ | ✓ | ✓ |

The recurring pattern: each approach relaxed one constraint while retaining another. SSA targets all four simultaneously.

### Why Hybrids Don't Scale

Hybrid models (Jamba, Kimi Linear, Qwen3.5) combine efficient recurrent layers with dense attention layers. The problem: **constant-factor improvements don't change asymptotic scaling**.

- A hybrid 3× cheaper than dense at 32K tokens maintains that ratio at millions of tokens
- The dense attention layers still dominate the cost profile at scale
- The ratio cannot be pushed down arbitrarily without losing retrieval capability

**MiniMax case study**: MiniMax-M1 used Lightning Attention + full attention. Their subsequent M2 returned to full attention because hybrid variants showed deficits on higher-order multi-hop reasoning at scale.

---

## Design Requirements

SSA was designed to satisfy three requirements simultaneously:

### Requirement 1: Dense-Attention-Level Retrieval Quality

Many efficient sequence models achieve favorable scaling but degrade retrieval and reasoning as context grows. SSA's design target was dense-attention-like retrieval from arbitrary positions, requiring **content-dependent routing** — determined by the tokens themselves, not by fixed positional patterns.

**What this rules out**:
- Fixed sparse patterns (Longformer local+global, BigBird random)
- Position-based routing (cannot adapt to content)

**What this enables**:
- Retrieval of specific facts from arbitrary positions
- Multi-hop reasoning across distant context
- Aggregation across the full context

### Requirement 2: Subquadratic Scaling

Dense attention scales quadratically — O(n²d) compute, O(n²) memory. SSA achieves linear scaling through three steps, each linear in sequence length:

1. **Selection** — content-dependent choice of which positions to attend to
2. **Retrieval** — reading the selected positions
3. **Attention** — computing the attention output over selected positions

The mechanism is **linear end-to-end**, not only within the attention operation itself.

### Requirement 3: Full-Context Training + Autoregressive Generation

The model must:
- **Training**: Optimize over the entire available context (not compressed state)
- **Inference**: Standard token-by-token generation

This rules out compressed-state approaches (Mamba, RetNet) where training decisions are mediated through state rather than direct access to arbitrary positions. It also rules out non-autoregressive approaches that depart from the generation paradigm underlying contemporary language-model reasoning and tool use.

---

## How SSA Works

The SSA mechanism involves content-dependent selection followed by sparse attention over selected positions. The exact algorithmic details are proprietary (Subversive AI, 2026), but the model card describes the key properties:

### Content-Dependent Selection

Each query selects a small subset of positions to attend to, based on content relevance rather than fixed patterns. This is conceptually similar to what DeepSeek's Lightning Indexer does, but with a critical difference in cost.

### Linear-Cost Pipeline

The selection, retrieval, and attention steps are each linear in sequence length. This makes the mechanism **linear end-to-end** — not just within the attention operation, but including the routing/selection overhead.

### Sparse Attention

After selection, attention is computed only over the selected positions. At 12M tokens, SSA attends to only **0.13% of token pairs** — an extremely sparse pattern that still maintains retrieval quality.

### Integration with Existing Models

SSA was applied to an existing open-weight frontier model by replacing its dense attention layers. The donor model's architecture, MLP layers, normalization, and other components were preserved. This demonstrates that SSA can be retrofitted onto existing transformer architectures.

---

## SSA vs Other Sparse Attention

### SSA vs Native Sparse Attention (NSA)

NSA (Yuan et al., 2025) uses hardware-aligned hierarchical sparse attention. Both are sparse and content-dependent, but:

- **NSA**: Hierarchical structure with hardware-aware design
- **SSA**: Focus on making the full pipeline (selection + retrieval + attention) linear end-to-end

### SSA vs DeepSeek Sparse Attention (DSA)

DeepSeek's Lightning Indexer is the closest published comparison. Both solve the same problem — dynamic content-dependent selection — but differ in where the cost is paid.

**Three DeepSeek Mechanisms**:

| Mechanism | Selection | Representation | Complexity |
|-----------|-----------|---------------|------------|
| **DSA** | Lightning Indexer (distilled full attention) | Uncompressed context | O(n²) |
| **CSA** | Lightning Indexer | Compressed context | O(n²) on compressed |
| **HCA** | No learned selection | Brute-force dense on compressed | O(m²) where m < n |

**SSA**: Content-dependent selection that remains linear regardless of context length.

### The Crossover Problem

DeepSeek's Lightning Indexer is cheaper than the attention it serves **only at short context**. Beyond ~52K tokens, its quadratic scoring overtakes the linear sparse attention:

| Sequence Length | Lightning Indexer Cost vs Sparse Attention |
|----------------|---------------------------------------------|
| ~52K | 1.0× (crossover) |
| 128K | 2.2× |
| 256K | 4.2× |
| 512K | 8.1× |
| 1M | 16.1× |
| 2M | 31.9× |
| 4M | 63.6× |
| 8M | 127.0× |
| 12M | 190.4× |

A routing mechanism intended to make long context affordable becomes the **dominant long-context cost**, reintroducing quadratic scaling after providing scalar compute savings.

### SSA Selector Cost

Under a matched selected-position budget, SSA is dramatically cheaper:

| Sequence Length | DSA / SSA Cost Ratio |
|----------------|---------------------|
| 128K | 3.2× |
| 256K | 5.2× |
| 512K | 9.1× |
| 1M | 17.1× |
| 2M | 32.9× |
| 4M | 64.6× |
| 8M | 128.0× |
| 12M | 191.3× |

At 12M tokens, SSA's selector is **191× cheaper** than DeepSeek's Lightning Indexer for the same selection task.

---

## Efficiency Analysis

### FLOPs Reduction

Per-layer attention-mechanism FLOPs for one attention layer (SSA vs dense on the same backbone):

| Context Length | Dense (PFLOP) | SSA (PFLOP) | Reduction |
|---------------|--------------|-------------|-----------|
| 32K | 0.25 | 0.12 | 2.1× |
| 64K | 0.99 | 0.25 | 4.0× |
| 128K | 3.9 | 0.49 | 8.0× |
| 256K | 15.8 | 0.99 | 16× |
| 512K | 63.0 | 2.0 | 31.5× |
| 1M | 252 | 3.9 | 64.5× |

The reduction grows with context length — this is a **scaling-law win**, not a uniform constant-factor speedup.

### Wall-Clock Speedup

Against FlashAttention-2 on a single attention layer (H100):

- **Parity**: ~16K tokens
- **1M tokens**: 56× speedup (966 ms SSA vs 54,164 ms FlashAttention-2)

### Conservative Sparsity

These measurements use conservative sparsity settings — "extremely safe in any setting, which proved to be true up to 12M tokens." Limited experiments with **4× greater sparsity** showed "extremely positive results." The sparsity floor could potentially be even lower.

### Implications for Experimentation

The efficiency gain translates directly to research throughput. Under dense attention, each long-context experiment incurs quadratically increasing costs. Under SSA:

- Iteration stayed **under a minute per step** at million-token context
- The team ran **more than one hundred long-context experiments**
- Variants could be compared across CPT mixtures, context-extension schedules, capability-balancing techniques, and post-training compositions

**Key insight**: If long-context capability is bottlenecked on experimental throughput rather than raw scale, algorithmic efficiency becomes a first-class scaling variable, comparable in importance to model size and dataset size.

---

## Context-Length Generalization

### The Core Result

SubQ-1.1-Small was trained primarily at 1M tokens, with additional training at 2M. Retrieval was evaluated out to 12M tokens.

**Needle-in-a-Haystack (single-needle UUID)**:

| Context Length | Accuracy |
|---------------|----------|
| 1M | 100% |
| 2M | 100% |
| 6M | 98% |
| 12M | 98% |

At 12M tokens, SSA attends to only **0.13% of token pairs**.

### Why This Generalizes

The behavior is consistent with SSA's content-dependent routing:

- Retrieval is driven by **content relevance**, not fixed positional patterns
- The mechanism may not impose an obvious context-length boundary once relevant routing behavior has been learned
- The model learned to route by content at 1M tokens, and that routing generalizes to 12M

### Emergence, Not Design Target

This generalization was **not a design target**. It emerged after long-context CPT. Previously, this result was achieved via multi-million-token SFT, but long-context CPT enabled generalization with less super-long-context SFT.

---

## Training Findings

### Long-Context CPT Is the Primary Lever

Across experiments, **long-context CPT volume was the most consistent predictor of long-context retrieval gains**. The team is careful about the strength of this claim — no controlled ablations with architecturally distinct backbones — but within their experiments, CPT was the most consistent lever.

Key findings:
- Post-training variants did not substitute for exposure to long contexts during CPT
- Long-context post-training benefited significantly from more long-context pre-training
- The most effective training mixtures combined naturally long sequences with shorter documents packed to target length

### Capability Balancing Is Critical

Gains in long-context capability frequently came at the expense of short-context capability unless training was managed for both. The team developed staged training with recovery phases to preserve the broader capability suite.

### Evaluation ≠ Deployment

Benchmark scores and deployment-shaped behavior diverged more than expected:
- **MRCR v2**: Initially looked important, but diverged from real-world tasks
- **RULER**: More useful development signal — multi-task structure overlaps with whole-artifact reasoning
- **Fixed spot-checks**: Repository-scale code reasoning, multi-document synthesis, contract analysis — these tracked qualitative quality better than any single benchmark

### Coding Data as Dual-Use

Coding data served a dual role during training:
1. Improved coding capability directly
2. Improved non-code long-context retrieval — code is dense with cross-position dependencies that train general routing behavior

---

## Limitations and Open Questions

### 1. Proprietary Details

The exact SSA algorithm is proprietary. The model card describes requirements, properties, and results but not the selection mechanism, attention computation, or implementation details.

### 2. Single Donor Model

SSA was demonstrated on one donor model. It's unclear how SSA interacts with different architectures, parameter counts, or training regimes.

### 3. Sparsity Floor Unknown

Conservative sparsity was used for safety. The team reports "extremely positive results" with 4× sparsity, but the actual floor is unknown. More aggressive sparsity could yield even greater efficiency gains.

### 4. BF16 Underflow at Extreme Lengths

At ~8M tokens and above, BF16 underflow and numerical-stability issues became practical constraints. This is a hardware limitation, not an SSA limitation, but it caps the currently practical evaluation range.

### 5. No GGUF Support Yet

SSA is not currently available in GGUF format for llama.cpp. This means it cannot run on Chac's local deployment setup. Future quantization work is needed.

### 6. Training Infrastructure Complexity

SSA required custom adaptations to sequence parallelism, CPU offloading, and Ring Attention. None of these techniques worked efficiently with SSA out of the box. This limits reproducibility for teams without similar infrastructure expertise.

---

## Relevance to Chac

Chac uses a two-tier RAG approach: wiki entries first (cosine similarity threshold 0.3), then raw chunks (top 5). SSA directly addresses the constraints that make this architecture necessary.

### If SSA Reaches Local Models

**Current Chac architecture** (designed for 4K-32K context):
```
Documents → Chunk (500 chars) → Embed → Store
                                         ↓
User Query → Embed → Search chunks → Search wiki → Top 5 → LLM
```

**Potential Chac architecture** (with SSA-class attention at 1M+ context):
```
Documents → Store (minimal chunking)
                 ↓
User Query → Load relevant documents → LLM reasons over full artifacts
```

### What Changes

| Current | With SSA |
|---------|----------|
| 500-char chunks | Entire documents or large sections |
| Two-tier retrieval (wiki + chunks) | Single-tier or no retrieval |
| Wiki compilation step | Eliminated — model reasons over raw content |
| Complex RAG orchestration | Simplified — model handles reasoning directly |
| 4K-32K context window | 1M+ context window |

### What Stays the Same

- Local deployment (SSA reduces compute, not storage)
- Document ingestion (still needs to store and index documents)
- Chat interface and session management
- Settings and configuration

### Timeline

SSA is not yet in GGUF format. The gap between research and local deployment includes:
1. Open-weight release of SSA-compatible models
2. GGUF quantization support in llama.cpp
3. Hardware capable of running 1M+ context locally (memory requirements)

**Estimated timeline**: 6-18 months before SSA-class attention reaches consumer hardware via llama.cpp.

---

## References

1. Subversive AI. (2026). "SubQ-1.1-Small Model Card." Technical Report. (See [Subq.md](./Subq.md))
2. Yuan, J. et al. (2025). "Native Sparse Attention: Hardware-Aligned and Natively Trainable Sparse Attention." arXiv:2502.11089. (See [Sub-quadratic.md](./Sub-quadratic.md))
3. DeepSeek-AI. (2025). "DeepSeek-V4-Flash: Compressed Sparse Attention with a Lightning Indexer." Technical Report.
4. DeepSeek-AI. (2026). "DeepSeek-V4-Flash: Compressed Sparse Attention with a Lightning Indexer." Model Card.
5. MiniMax. (2025). "Why did MiniMax-M2 end up as a full attention model?" Engineering Blog.
6. MiniMax. (2026). "The MiniMax-M2 series." arXiv:2605.26494.
7. Gu, A. & Dao, T. (2023). "Mamba: Linear-Time Sequence Modeling with Selective State Spaces." arXiv:2312.00752.
8. Sun, Y. et al. (2023). "Retentive Network: A Successor to Transformer for Large Language Models." arXiv:2307.08621.
9. Beltagy, I. et al. (2020). "Longformer: The Long-Document Transformer." arXiv:2004.05150.
10. Zaheer, M. et al. (2020). "Big Bird: Transformers for Longer Sequences." NeurIPS 2020.
