# SubQ-1.1-Small: Subquadratic Sparse Attention in Practice

> "The value of SSA is not only that it makes long-context inference cheaper. It makes long-context experimentation cheaper." — Subversive AI, 2026

**See also:** [Sub-Quadratic Attention](./Sub-quadratic.md) · [SSA Deep-Dive](./SSA.md) · [MLA Deep-Dive](./MLA.md) · [GPT Architecture](./GPT.md) · [The Karpathy Method](./Karpathy.md) · [Mixture of Experts](./MoE.md) · [DSpark](./Dspark.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Overview](#overview)
2. [Background: The Long-Context Problem](#background-the-long-context-problem)
3. [Subquadratic Sparse Attention (SSA)](#subquadratic-sparse-attention-ssa)
4. [Model Architecture](#model-architecture)
5. [Training Process](#training-process)
6. [Experimental Infrastructure](#experimental-infrastructure)
7. [Results](#results)
8. [Discussion](#discussion)
9. [SSA vs DeepSeek Sparse Attention](#ssa-vs-deepseek-sparse-attention)
10. [Implications for Long-Context Applications](#implications-for-long-context-applications)
11. [Relevance to Chac](#relevance-to-chac)
12. [References](#references)

---

## Overview

SubQ-1.1-Small is a long-context language model built by Subversive AI on **Subquadratic Sparse Attention (SSA)**, a content-dependent attention mechanism with linear compute and memory complexity. Rather than training from scratch, the team converted an existing open-weight frontier model by replacing its dense attention with SSA, then developed long-context capability through staged context extension, large-scale continued pretraining, and targeted post-training.

The central result: SubQ-1.1-Small was trained primarily at 1M tokens, yet single-needle retrieval held at 98% at both 6M and 12M tokens — generalizing far beyond the training window.

---

## Background: The Long-Context Problem

The report identifies a recurring pattern in long-context research: each approach relaxes one constraint while retaining another.

### The Four Requirements

A complete long-context solution must provide:

1. **Dense-attention-level retrieval quality** — content-dependent routing, not fixed positional patterns
2. **Subquadratic scaling** — cost growing slower than O(n²)
3. **Full-context training** — optimize over entire available context, not compressed state
4. **Autoregressive generation** — standard token-by-token decoding at inference

### Why Previous Approaches Fall Short

| Approach | Achieves | Retains |
|----------|----------|---------|
| **Sparse attention** (Longformer, BigBird) | Efficient scaling | No content-dependent selection |
| **Linear attention** (RWKV, RetNet) | O(n) scaling | Compressed state — loses exact retrieval |
| **State-space models** (Mamba) | O(n) scaling | Compressed state — loses arbitrary-position access |
| **Hybrid models** (Jamba, Kimi Linear) | Partial efficiency | Dense attention layers still scale O(n²) |
| **System-level** (RAG, agentic) | Scales to large corpora | Retrieval outside the model — orchestration overhead |

The hybrid problem is particularly insidious: constant-factor improvements don't change asymptotic scaling. A hybrid that's 3× cheaper at 32K tokens maintains that ratio at millions of tokens, with the quadratic component dominating the cost profile.

**MiniMax case study**: MiniMax-M1 used a hybrid of Lightning Attention + full attention. Their subsequent M2 model returned to full attention across all layers because hybrid variants showed deficits on higher-order multi-hop reasoning at larger scale, and efficient attention infrastructure remained less mature than full attention.

---

## Subquadratic Sparse Attention (SSA)

SSA was designed to satisfy three requirements simultaneously:

### Requirement 1: Dense-Attention-Level Retrieval

Retrieval and reasoning behavior must match dense attention. Many efficient sequence models achieve favorable scaling but degrade retrieval and reasoning as context grows. The design target was dense-attention-like retrieval from arbitrary positions, requiring content-dependent routing determined by the tokens themselves.

### Requirement 2: Subquadratic Scaling

Dense attention scales quadratically. SSA is sparse — each query attends to a small, selected subset of positions. The selection, retrieval, and attention steps are each linear in sequence length, making the mechanism linear end-to-end rather than only within the attention operation.

### Requirement 3: Full-Context Training + Autoregressive Generation

The model must optimize over the entire context during training while retaining standard sequential decoding at inference. This rules out compressed-state approaches (Mamba, RetNet) where training decisions are mediated through state rather than direct access to arbitrary positions.

### Efficiency Gains

| Context Length | Dense Attention (PFLOP) | SSA (PFLOP) | Reduction |
|---------------|------------------------|-------------|-----------|
| 32K | 0.25 | 0.12 | 2.1× |
| 64K | 0.99 | 0.25 | 4.0× |
| 128K | 3.9 | 0.49 | 8.0× |
| 256K | 15.8 | 0.99 | 16× |
| 512K | 63.0 | 2.0 | 31.5× |
| 1M | 252 | 3.9 | 64.5× |

At 1M tokens, SSA reduces attention FLOPs by **64.5×**. Against FlashAttention-2 on a single attention layer (H100), SSA reaches parity near 16K tokens and achieves a **56× speedup at 1M tokens** (966 ms vs. 54,164 ms).

Critically, these are conservative measurements. The team set conservative sparsity to ensure safety up to 12M tokens. Limited experiments with 4× greater sparsity showed "extremely positive results," with the floor potentially even lower.

---

## Model Architecture

SubQ-1.1-Small was not trained from scratch. The donor model was an existing open-weight frontier model with a 262K-token context window. SSA replaced the dense attention layers, and long-context capability was developed through:

1. Staged context extension via YaRN positional scaling
2. Large-scale continued pretraining (CPT)
3. Targeted post-training for capability balance

### Key Specs

- **Context window**: 2M tokens (training), evaluated up to 12M tokens
- **Architecture**: Donor model backbone with SSA attention layers
- **Parameters**: Not disclosed in the model card
- **Training data**: Books, long documents, repository-scale code, synthetic retrieval tasks, coding examples, educational materials

---

## Training Process

### Context Extension

The donor model's 262K context was extended in stages:

```
262K → 512K → 1M → 2M
```

YaRN positional scaling was re-applied at each stage. Long-context CPT was performed between extension stages rather than extending directly to the final target.

### Continued Pretraining (CPT)

CPT was the primary mechanism for developing long-context capability. Training emphasized naturally long-form data (books, long documents, repository-scale code) to expose the model to genuine long-range dependencies.

The training mixture combined naturally long sequences with shorter documents packed to the target context length using document separators. Cross-document attention boundaries were not masked during packing — the model attended over the entire packed sequence, including separator tokens.

**Most CPT tokens were trained at 1M context**. To study how long-context capability develops, CPT volume and context length were varied across model generations.

### Post-Training

Post-training shaped how long-context capability was expressed while preserving reasoning, coding, and instruction-following abilities.

**Key challenges**:
- Improvements in retrieval did not reliably transfer to other capabilities
- Training choices that strengthened long-context behavior could shift capability balance
- Sample-level loss aggregation was explored to reduce the influence of extremely long examples on gradient updates

**Post-training corpus**: Synthetic retrieval tasks, long-context reasoning data, coding examples, educational materials, and general instruction-following data. Training was staged and iterative — targeted phases introduced specific capabilities, followed by recovery phases to preserve the broader capability suite.

---

## Experimental Infrastructure

Training on multi-million-token sequences is a memory problem as much as a compute problem. A typical long-context run used ~1-2 million tokens per node, with iteration under a minute per step.

### Memory-Scaling Ladder

Rather than adopting the most expensive distributed configuration from the start, training progressed up a ladder:

1. **Single node** — simplest configuration
2. **Intra-node sequence parallelism** — sharding long examples across GPUs in a node
3. **CPU offloading** — moving optimizer state and activations off-device
4. **Multi-node execution** — for the longest contexts
5. **Multi-node sequence parallelism** — distributing examples across nodes
6. **Ring Attention** — for individual examples across nodes

The foundation was hybrid-sharded data parallelism (parameters and optimizer state sharded within a node, replicated across nodes), with DeepSpeed Ulysses sequence parallelism and ZeRO-style partitioning with CPU offload.

**SSA-specific adaptations**: None of the above techniques operated efficiently with SSA out of the box. Each required adaptation to accommodate SSA's content-dependent selection and retrieval operations, which introduce memory-access patterns and synchronization requirements absent from standard dense attention.

At extreme evaluation lengths (~8M tokens and above), BF16 underflow and numerical-stability issues became practical constraints.

---

## Results

### Long-Context Retrieval

**RULER (128K tokens)**: 99.12 on the full 13-task average. Performance effectively saturated on retrieval-oriented tasks; errors concentrated in aggregation-style tasks (common-word and frequent-word extraction).

**Needle-in-a-Haystack (NIAH)**:

| Context Length | Accuracy |
|---------------|----------|
| 1M | 100% |
| 2M | 100% |
| 6M | 98% |
| 12M | 98% |

At 12M tokens, SSA attends to only **0.13% of token pairs**. The evaluation used 50 single-needle UUID samples packed to ~12M tokens, prepared for third-party verification.

### Knowledge Capability

**GPQA Diamond** (graduate-level science): **85.4% pass@1**. Lands between small and mid frontier tiers — ahead of GPT-5.4-nano (81.7%) and Haiku 4.5 (67.2%), close to Sonnet 4.6 and GPT-5.4-mini (87.5%). Confirms long-context optimization does not inherently sacrifice reasoning quality.

### Coding Capability

**LiveCodeBench v6** (pass@4): **89.7%**. Confirms coding behavior was preserved after long-context optimization. Coding data served a dual role during training — it improved non-code long-context retrieval because code is dense with cross-position dependencies that train general routing behavior.

### Long-Horizon Agentic Tasks

**AutomationBench Finance**: **13%**. Close to the absolute frontier (Opus 4.8 at 16%, GPT-5.5 at 18%) and ahead of Sonnet 4.6 (8%), Haiku 4.5 (3%), and GPT-5.4-Mini (0%). Tests multi-step reasoning across interconnected business applications via REST APIs.

---

## Discussion

### Context-Length Generalization

The central result is not a score at any single length — it's the algorithm's ability to generalize retrieval beyond the training window. Training occurred overwhelmingly at 1M tokens; evaluation reached 12M (6× the maximum trained length).

Single-needle retrieval generalized strongly. This was not a design target — it emerged after long-context CPT. Previously, this result was achieved via multi-million-token SFT, but long-context CPT enabled generalization with less super-long-context SFT.

The behavior is consistent with SSA's content-dependent routing: because retrieval is driven by content relevance rather than fixed positional patterns, the mechanism may not impose an obvious context-length boundary once relevant routing behavior has been learned.

### Efficient Attention as a Research Accelerator

Under SSA, the team ran **more than one hundred long-context experiments**. Under dense attention, each experiment incurs quadratically increasing costs, limiting hypotheses testable at relevant context lengths.

SSA reduced iteration to under a minute per step at million-token context, enabling repeated variants across CPT mixtures, context-extension schedules, capability-balancing techniques, and post-training compositions.

The observations in the report emerged from this high-variant-count regime — each was visible only because the team could afford the variants that surfaced it.

### Long-Context Pretraining as the Unlock

Across experiments, **long-context CPT volume was the most consistent predictor of long-context retrieval gains**. The team is careful about how strongly to read this — no controlled ablations with architecturally distinct backbones — but within their experiments, CPT was the most consistent lever.

Post-training variants did not substitute for exposure to long contexts during continued pretraining. Long-context post-training benefited significantly from more long-context pre-training.

### Balancing Short- and Long-Context Capability

Gains in long-context capability frequently came at the expense of short-context capability unless training was managed for both. Sometimes long- and short-context training were complementary — a long-context run could improve short-context performance.

### Evaluation and Measurement

Benchmark scores and deployment-shaped behavior diverged more than expected. MRCR v2 initially looked like an important long-context signal, but as development progressed, MRCR movement diverged from the behaviors the team was trying to improve (repository-scale code reasoning, multi-document synthesis, contract analysis).

**RULER became the more useful development signal** — its multi-task structure better overlaps with whole-artifact reasoning: aggregation, composition, retrieval under distractors, and multi-hop reasoning.

---

## SSA vs DeepSeek Sparse Attention

DeepSeek's dynamic sparse attention (DSA) is the closest published comparison point. The key mechanism in DeepSeek V3.2 and V4 is the **Lightning Indexer**: a learned mechanism that dynamically chooses which context positions each query should attend to.

### Three DeepSeek Mechanisms

| Mechanism | Selection | Representation |
|-----------|-----------|---------------|
| **DSA** | Lightning Indexer (full attention, distilled) | Uncompressed context |
| **CSA** | Lightning Indexer | Compressed context |
| **HCA** | No learned selection | Brute-force dense over compressed context |

SSA directly targets the selection role played by the Lightning Indexer. Conceptually, SSA can replace the selector in either DSA (uncompressed) or CSA (compressed) settings.

### The Cost of Selection

The Lightning Indexer in DSA is cheaper than the attention it serves only at short context. Beyond a crossover near **52,000 tokens**, its quadratic scoring overtakes the linear sparse attention:

| Sequence Length | Indexer / Sparse Attention Cost Ratio |
|----------------|--------------------------------------|
| ~52K | 1.0× (crossover) |
| 128K | 2.2× |
| 256K | 4.2× |
| 512K | 8.1× |
| 1M | 16.1× |
| 2M | 31.9× |
| 4M | 63.6× |
| 8M | 127.0× |
| 12M | 190.4× |

A routing mechanism intended to make long context affordable becomes the dominant long-context cost, reintroducing quadratic scaling.

### SSA Selector Advantage

Under a matched selected-position budget, SSA is dramatically cheaper:

| Sequence Length | DSA / SSA Cost Ratio |
|----------------|---------------------|
| 128K | 3.2× |
| 1M | 17.1× |
| 12M | 191.3× |

SSA achieves the same selection role without reintroducing the quadratic scaling laws of the Lightning Indexer.

---

## Implications for Long-Context Applications

### Whole-Artifact Reasoning

The practical implication is not simply that larger windows fit more tokens. Some tasks currently implemented as retrieval problems are more naturally whole-artifact reasoning problems once the relevant artifact fits in context.

The structure recurs across domains:
- **Legal work**: Cross-reference resolution across a contract
- **Financial review**: Connecting filings and internal records
- **Research**: Synthesis across a bounded literature

In each case, the difficulty is not locating a passage — it's reasoning over relationships distributed across the artifact. Fragmentation systematically destroys those relationships before the model ever sees them.

### Retrieval Is Not Obsolete

For corpora larger than any plausible context window, knowledge that changes faster than the prompt can be updated, and workflows with genuine multi-stage structure, retrieval and orchestration remain the right tools.

The narrower claim: some scaffolding exists primarily to compensate for context limits. As efficient long-context models extend the reachable window, that class of scaffolding becomes smaller.

---

## Relevance to Chac

Chac currently uses a two-tier RAG approach: wiki entries first (cosine similarity threshold 0.3), then raw chunks (top 5). This is exactly the kind of retrieval-orchestration pattern that long-context models like SubQ-1.1-Small could simplify.

**If Chac's local LLM supported 1M+ context**:
- **Wiki compilation could be simplified** — instead of pre-compiling documents into structured wiki entries, the model could reason over raw document chunks directly
- **Two-tier retrieval could become one-tier** — no need to separate wiki and chunk search if the model can hold entire documents in context
- **Chunk size could increase** — currently limited by context window; larger chunks preserve more cross-position relationships
- **RAG scaffolding could shrink** — the retrieval layer becomes thinner as the model handles more reasoning internally

**Current constraints**:
- llama.cpp models typically support 4K–32K context, not millions of tokens
- Local hardware cannot run models large enough to benefit from SSA
- The Karpathy Method's wiki compilation is specifically designed to work within small context windows

**Future relevance**: As context windows grow on local hardware (via techniques like SSA or efficient attention), Chac's architecture could evolve from "retrieve fragments, then reason" to "hold the artifact, then reason" — simplifying the pipeline while improving reasoning quality.

---

## References

[1] Arora et al. "Zoology: Measuring and improving recall in efficient language models." ICLR, 2024.
[2] Beltagy et al. "Longformer: The long-document transformer." arXiv:2004.05150, 2020.
[3] Child et al. "Generating long sequences with sparse transformers." arXiv:1904.10509, 2019.
[5] Dao. "FlashAttention-2: Faster attention with better parallelism and work partitioning." arXiv:2307.08691, 2023.
[6] Dao and Gu. "Transformers are SSMs." ICML, 2024.
[7] Dao et al. "FlashAttention: Fast and memory-efficient exact attention with IO-awareness." NeurIPS, 2022.
[8] DeepSeek-AI. "DeepSeek-V3 technical report." arXiv:2412.19437, 2024.
[10] DeepSeek-AI. "Native sparse attention." arXiv:2502.11089, 2025.
[11] DeepSeek-AI. "DeepSeek-V4-Flash." 2026.
[12] Gemma Team. "Gemma 4 technical report." 2026.
[13] Gu and Dao. "Mamba: Linear-time sequence modeling with selective state spaces." arXiv:2312.00752, 2023.
[14] Hsieh et al. "RULER: What's the real context size of your long-context language models?" arXiv:2404.06654, 2024.
[16] Jain et al. "LiveCodeBench." arXiv:2403.07974, 2024.
[17] Jelassi et al. "Repeat after me: Transformers are better than state space models at copying." ICML, 2024.
[18] Katharopoulos et al. "Transformers are RNNs: Fast autoregressive transformers with linear attention." ICML, 2020.
[19] Kimi Team. "Kimi linear." arXiv:2510.26692, 2025.
[22] Lieber et al. "Jamba: A hybrid transformer-mamba language model." arXiv:2403.19887, 2024.
[23] Liu et al. "Ring attention with blockwise transformers for near-infinite context." arXiv:2310.01889, 2023.
[24] MiniMax. "Why did MiniMax-M2 end up as a full attention model?" Blog, 2025.
[25] MiniMax. "MiniMax-M1: Scaling lightning attention to 128k sequences." 2025.
[26] MiniMax. "The MiniMax-M2 series." arXiv:2605.26494, 2026.
[28] Peng et al. "RWKV: Reinventing RNNs for the transformer era." arXiv:2305.13048, 2023.
[29] Peng et al. "YaRN: Efficient context window extension of large language models." arXiv:2309.00071, 2023.
[32] Rein et al. "GPQA: A graduate-level google-proof Q&A benchmark." arXiv:2311.12022, 2023.
[33] Shepard and Salimans. "AutomationBench." arXiv:2604.18934, 2026.
[34] Sun et al. "Retentive network: A successor to transformer for large language models." arXiv:2307.08621, 2023.
[36] Vaswani et al. "Attention is all you need." NeurIPS, 2017.
[37] Xu et al. "From 128K to 4M: Efficient training of ultra-long context large language models." arXiv:2504.06214, 2025.
[38] Yang et al. "Gated delta networks: Improving Mamba2 with delta rule." ICLR, 2025.
[40] Zhang et al. "Recursive language models." arXiv:2512.24601, 2025.

**Source**: Subversive AI. "SubQ-1.1-Small Model Card." 2026. (`Docs/subq-1-1-small-model-card.pdf`)
