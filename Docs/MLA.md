# Multi-Head Latent Attention (MLA): KV Cache Compression via Low-Rank Decomposition

> "The key insight is that the KV cache is low-rank — most of it is redundant."

**See also:** [SubQ-1.1-Small](./Subq.md) · [SSA Deep-Dive](./SSA.md) · [Sub-Quadratic Attention](./Sub-quadratic.md) · [GPT Architecture](./GPT.md) · [Mixture of Experts](./MoE.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Overview](#overview)
2. [The KV Cache Problem](#the-kv-cache-problem)
3. [Attention Variants](#attention-variants)
4. [How MLA Works](#how-mla-works)
5. [Mathematical Formulation](#mathematical-formulation)
6. [KV Cache Compression](#kv-cache-compression)
7. [DeepSeek V2/V3 Implementation](#deepseek-v2v3-implementation)
8. [MLA vs Other KV Compression](#mla-vs-other-kv-compression)
9. [Efficiency Analysis](#efficiency-analysis)
10. [Limitations](#limitations)
11. [Relevance to Chac](#relevance-to-chac)
12. [References](#references)

---

## Overview

Multi-Head Latent Attention (MLA) is a KV cache compression technique introduced by DeepSeek (2024) that projects Key and Value representations into a low-rank latent space. Instead of caching full K and V vectors for every token, MLA caches a compressed latent vector that can be decompressed on-the-fly during attention computation.

MLA was used in DeepSeek V2 (2024) and DeepSeek V3 (2025), enabling the 671B-parameter model to run with a KV cache smaller than many 70B dense models. It is the primary attention mechanism that makes DeepSeek's extreme MoE scale practical.

---

## The KV Cache Problem

### Why KV Caching Matters

During autoregressive generation, each new token attends to all previous tokens. Naively, this requires recomputing attention over the entire sequence for every new token — O(n²) per step. KV caching avoids this by storing the Key and Value vectors from previous tokens.

### Memory Cost

For a model with `h` attention heads, head dimension `d_h`, and `L` layers:

```
KV Cache per token = 2 × h × d_h × L (K and V)
```

| Model | Params | Layers | Heads | d_h | KV Cache per token |
|-------|--------|--------|-------|-----|-------------------|
| LLaMA-7B | 7B | 32 | 32 | 128 | 32 KB |
| LLaMA-70B | 70B | 80 | 64 | 128 | 128 KB |
| DeepSeek-V3 | 671B | 61 | 128 | 128 | 62 KB (with MLA) |

At 128K context, DeepSeek-V3's MLA KV cache is **~8 GB** — versus ~62 GB if using standard MHA. This is the difference between fitting on a single node vs. requiring multi-GPU inference.

### The Bottleneck

KV cache memory grows linearly with context length and model size. For long-context models (1M+ tokens), the KV cache can exceed the model's own parameter memory. This is the primary constraint that MLA, GQA, MQA, and similar techniques address.

---

## Attention Variants

### Multi-Head Attention (MHA) — Baseline

Standard transformer attention. Each head has its own Q, K, V projections.

```
Q_i = X W_i^Q    (h heads)
K_i = X W_i^K
V_i = X W_i^V
```

- **KV Cache per token**: `2 × h × d_h` (full)
- **Quality**: Maximum expressiveness
- **Memory**: Grows linearly with head count

### Multi-Query Attention (MQA)

Shard, Hsu, et al. (2019). All query heads share a **single** K and V head.

```
Q_i = X W_i^Q    (h heads)
K = X W^K         (1 head, shared)
V = X W^V         (1 head, shared)
```

- **KV Cache per token**: `2 × d_h` (1/ h of MHA)
- **Quality**: ~1-2% quality loss on most benchmarks
- **Memory**: h× reduction

### Grouped-Query Attention (GQA)

Ainslie et al. (2023). Query heads are divided into `g` groups, each sharing one K and V head. MQA and MHA are special cases (g=1 and g=h).

```
Q_i = X W_i^Q              (h heads)
K_j = X W_j^K              (g groups)
V_j = X W_j^V              (g groups)
```

- **KV Cache per token**: `2 × g × d_h`
- **Quality**: Interpolates between MQA and MHA
- **Memory**: Tunable via group count

### Multi-Head Latent Attention (MLA)

DeepSeek (2024). K and V are projected through a **low-rank bottleneck** (latent space). The KV cache stores the compressed latent, not the full K and V.

```
c_KV = X W_DKV           (latent compression: d_model → d_c)
K_i = c_KV W_UK_i        (decompression per head)
V_i = c_KV W_UV_i        (decompression per head)
```

- **KV Cache per token**: `d_c` (typically much smaller than MHA)
- **Quality**: Matches or exceeds MHA
- **Memory**: Compression ratio = `(2 × h × d_h) / d_c`

---

## How MLA Works

### Core Idea

The KV cache is low-rank — most of the information in K and V vectors across heads is redundant. MLA exploits this by:

1. **Compressing** K and V into a shared low-rank latent vector `c_KV`
2. **Caching** only `c_KV` (much smaller than full K and V)
3. **Decompressing** on-the-fly during attention computation

### The Low-Rank Bottleneck

Instead of projecting each token into separate K and V spaces:

```
Standard:  K = X W_K    (d_model → n_heads × d_h)
           V = X W_V    (d_model → n_heads × d_h)

MLA:       c_KV = X W_DKV    (d_model → d_c)    ← cache this
           K = c_KV W_UK      (d_c → n_heads × d_h)  ← decompress
           V = c_KV W_UV      (d_c → n_heads × d_h)  ← decompress
```

The compression ratio is `(n_heads × d_h) / d_c`. With `d_c = 512` and `n_heads × d_h = 16,384`, the compression ratio is **32×**.

### Attention Computation

During attention, the cached latent is decompressed:

```
Attention(Q, K, V) = softmax(Q Kᵀ / √d_h) V

Where:
  K = decompress(c_KV)
  V = decompress(c_KV)
```

The decompression cost is O(d_c × n_heads × d_h) per head — linear in the latent dimension, not the sequence length.

### Why Low-Rank Works

The key insight from DeepSeek V2: across different heads and positions, the K and V representations share significant structure. The effective rank of the KV cache is much lower than its nominal dimensionality. By projecting into a shared latent space, MLA captures the essential information while discarding redundant dimensions.

---

## Mathematical Formulation

### Compression (Offline / At Cache Time)

For a token at position t:

```
c_KV_t = X_t · W_DKV ∈ R^{d_c}
```

Where:
- `X_t ∈ R^{d_model}` — the token's hidden state
- `W_DKV ∈ R^{d_model × d_c}` — down-projection matrix
- `d_c` — latent dimension (typically 512–1024)

### Decompression (Online / At Attention Time)

```
K_t = c_KV_t · W_UK ∈ R^{n_heads × d_h}
V_t = c_KV_t · W_UV ∈ R^{n_heads × d_h}
```

Where:
- `W_UK ∈ R^{d_c × n_heads × d_h}` — K up-projection
- `W_UV ∈ R^{d_c × n_heads × d_h}` — V up-projection

### Full Attention with MLA

```
Q = X · W_Q                              (n_heads × d_h)
K = c_KV · W_UK                          (decompressed)
V = c_KV · W_UV                          (decompressed)
Output = softmax(Q · Kᵀ / √d_h) · V
```

### KV Cache Size Comparison

| Method | KV Cache per token | For 61-layer model |
|--------|-------------------|-------------------|
| MHA (h=128, d_h=128) | 32,768 floats | 7.8 MB |
| GQA (g=8, d_h=128) | 2,048 floats | 0.5 MB |
| MQA (1 head) | 256 floats | 0.06 MB |
| MLA (d_c=512) | 512 floats | 0.12 MB |

---

## KV Cache Compression

### Compression Ratios

MLA achieves compression by storing `d_c` floats per token instead of `2 × n_heads × d_h`:

```
Compression ratio = (2 × n_heads × d_h) / d_c
```

| Configuration | MHA KV | MLA KV (d_c=512) | Ratio |
|--------------|--------|-------------------|-------|
| 32 heads × 128 | 8,192 | 512 | 16× |
| 64 heads × 128 | 16,384 | 512 | 32× |
| 128 heads × 128 | 32,768 | 512 | 64× |

### Quality Preservation

The critical question is whether compression degrades attention quality. DeepSeek's results show:

- MLA **matches or exceeds MHA** on standard benchmarks
- MLA **outperforms GQA** with comparable KV cache sizes
- The low-rank bottleneck acts as an **implicit regularizer**, improving generalization

### Why Compression Preserves Quality

1. **Redundancy**: K and V vectors across heads share significant structure
2. **Shared latent space**: The compression is learned end-to-end, not a fixed projection
3. **Decompression is exact**: The up-projection reconstructs full K and V from the latent
4. **Regularization effect**: The bottleneck prevents overfitting to head-specific noise

---

## DeepSeek V2/V3 Implementation

### DeepSeek V2 (2024)

MLA was introduced alongside DeepSeek's fine-grained MoE architecture:

- **Model**: 236B total parameters, 21B active
- **MLA latent dimension**: ~512 (estimated)
- **Result**: KV cache comparable to a much smaller dense model, despite 236B total parameters
- **Paper**: "DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model"

### DeepSeek V3 (2025)

MLA scaled to 671B parameters:

- **Model**: 671B total, 37B active per token
- **Layers**: 61 (256 experts, top-8 routing)
- **MLA + MoE**: MLA compresses KV cache, MoE reduces active parameters
- **Result**: Competitive with GPT-4 class models at a fraction of the inference cost

### The MLA + MoE Synergy

DeepSeek's architecture combines two compression strategies:

| Strategy | What It Compresses | How |
|----------|-------------------|-----|
| **MoE** | Active parameters | Only 8 of 256 experts fire per token |
| **MLA** | KV cache memory | Low-rank latent compression |

Together, they achieve:
- **Parameters**: 671B total → 37B active (18× reduction via MoE)
- **KV Cache**: 32,768 → 512 per token (64× reduction via MLA)
- **Result**: A 671B model that runs with the memory footprint of a ~10B model

---

## MLA vs Other KV Compression

### MLA vs GQA

| Aspect | GQA | MLA |
|--------|-----|-----|
| Compression method | Group sharing | Low-rank projection |
| KV cache size | `g × d_h × 2` | `d_c` |
| Quality | Minor degradation | Matches MHA |
| Implementation | Simple (group heads) | Requires compression/decompression |
| Flexibility | Fixed groups | Learned latent space |

### MLA vs MQA

| Aspect | MQA | MLA |
|--------|-----|-----|
| KV cache size | `d_h × 2` | `d_c` |
| Quality | ~1-2% degradation | Matches MHA |
| Head diversity | None (single KV) | Full (decompressed per head) |
| Expressiveness | Limited | Full MHA-level |

### MLA vs Quantized KV Cache

| Aspect | Quantization | MLA |
|--------|-------------|-----|
| Compression method | Reduce precision (FP16→INT4) | Reduce dimension |
| KV cache size | `n × bits / 8` | `d_c` |
| Quality | Minor degradation from quantization | No degradation |
| Implementation | Simple (cast types) | Requires learned projections |
| Composability | Can combine with MLA | — |

### MLA vs Sparse Attention (NSA, SSA)

MLA and sparse attention address **different bottlenecks**:

| Aspect | MLA | Sparse Attention (NSA/SSA) |
|--------|-----|---------------------------|
| Target | KV cache memory | Attention compute (O(n²)) |
| Scaling benefit | Linear memory per token | Subquadratic compute |
| Quality | Matches MHA | Matches MHA (with care) |
| Can combine | Yes | Yes — MLA compresses cache, SSA reduces compute |

**Key insight**: MLA and SSA/composable sparse attention are complementary. MLA reduces the memory per token; SSA reduces the number of tokens each query attends to. A model could use both simultaneously.

---

## Efficiency Analysis

### Memory Savings at Scale

For DeepSeek-V3 (61 layers, 128 heads, d_h=128):

| Context Length | MHA KV Cache | MLA KV Cache (d_c=512) | Savings |
|---------------|-------------|----------------------|---------|
| 4K | 31 GB | 0.5 GB | 62× |
| 32K | 252 GB | 4 GB | 62× |
| 128K | 1 TB | 16 GB | 62× |
| 1M | 8 TB | 125 GB | 62× |

Without MLA, a 128K-context DeepSeek-V3 would require ~1 TB just for the KV cache. With MLA, it requires ~16 GB — fitting on a single 80GB GPU.

### Inference Cost

MLA's decompression cost is amortized across the sequence:
- **Prefill**: Decompression cost is O(n × d_c × n_heads × d_h), comparable to MHA
- **Decode**: Decompression per step is O(d_c × n_heads × d_h), negligible vs. attention computation
- **Memory bandwidth**: MLA reads `d_c` from cache instead of `2 × n_heads × d_h`, reducing memory bandwidth by the compression ratio

### Training Cost

MLA adds compression/decompression projections to the model. The overhead is:
- **Forward pass**: Two additional matrix multiplications (down-projection + up-projection)
- **Parameters**: `d_model × d_c` (down) + `d_c × n_heads × d_h` (up) per layer
- **Total overhead**: ~1-2% of model parameters

---

## Limitations

### 1. Decompression Overhead

MLA requires decompressing K and V at every attention computation. While the cost is small relative to attention, it adds latency to every forward pass.

### 2. Training Complexity

MLA requires learning the compression and decompression projections end-to-end. This adds complexity to the training pipeline and requires careful initialization.

### 3. Latent Dimension Selection

The latent dimension `d_c` is a hyperparameter that trades off compression ratio vs. quality. Too small loses information; too large reduces the compression benefit. Optimal `d_c` varies by model size and task.

### 4. Not a Compute Reduction

MLA reduces **memory**, not **compute**. The attention computation itself is still O(n²) per layer. For compute reduction, sparse attention (NSA, SSA) is needed. MLA and sparse attention are complementary, not substitutes.

### 5. Interoperability

MLA's compression/decompression is tightly coupled to the attention mechanism. It cannot be trivially applied to existing models without retraining. This limits its adoption outside of models trained with MLA from the start.

### 6. Limited Open-Source Reproduction

MLA's exact implementation details are partially proprietary. While the DeepSeek V2 paper describes the architecture, reproducing MLA's efficiency gains requires the same level of engineering investment.

---

## Relevance to Chac

Chac uses llama.cpp with standard attention (MHA or GQA). MLA is relevant in several ways:

### 1. Enabling Larger Models Locally

MLA's KV cache compression could allow Chac to run larger, more capable models on the same hardware. A model with MLA and 70B parameters could have a KV cache comparable to a 7B model with MHA.

### 2. Longer Context Windows

With MLA, Chac could support longer context windows without exceeding memory limits. A 128K context with MLA uses ~16 GB of KV cache, versus ~1 TB without it.

### 3. MLA + MoE = Practical Local Inference

DeepSeek's MLA + MoE combination is the most efficient large-scale architecture currently available. If DeepSeek releases GGUF-compatible models with MLA, Chac could run a 671B-parameter model with the memory footprint of a ~10B model.

### 4. Complementary to SSA

MLA reduces memory per token; SSA reduces compute per token. A future Chac model could use both:
- **MLA**: Compress KV cache to fit in local memory
- **SSA**: Reduce attention compute to fit in local GPU bandwidth

### 5. Current Constraints

- MLA models are not yet widely available in GGUF format
- llama.cpp support for MLA is limited
- DeepSeek V3's MLA implementation requires the full DeepSeek inference stack
- Quantized MLA models may lose some compression benefits

### 6. Future Direction

As MLA-compatible models become available in quantized formats, Chac's architecture could evolve:
- **Current**: MHA/GQA + standard KV cache → limited by KV memory
- **Future**: MLA + compressed KV → larger models, longer context, same hardware

---

## References

1. DeepSeek-AI. (2024). "DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model." arXiv:2405.04434.
2. DeepSeek-AI. (2025). "DeepSeek-V3 Technical Report." arXiv:2412.19437.
3. Shazeer, N. (2019). "Fast Transformer Decoding: One Write-Head is All You Need." arXiv:1911.02150. (MQA)
4. Ainslie, J. et al. (2023). "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints." arXiv:2305.13245. (GQA)
5. Vaswani, A. et al. (2017). "Attention Is All You Need." NeurIPS 2017. (MHA)
6. Subversive AI. (2026). "SubQ-1.1-Small Model Card." (SSA comparison)
7. Kimi Team. (2025). "Kimi Linear: An Expressive, Efficient Attention Architecture." arXiv:2510.26692. (MLA + linear attention hybrid)

**See also**: [Sub-quadratic.md](./Sub-quadratic.md) for the broader context of attention variants, and [Subq.md](./Subq.md) for SSA's complementary approach to compute reduction.
