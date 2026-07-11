# Sub-Quadratic Sparse-Attention Architectures: A Comprehensive Guide

> The quadratic bottleneck is not a wall — it's a door waiting for the right key.

**See also:** [The Karpathy Method](./Karpathy.md) · [Mixture of Experts](./MoE.md) · [Swarm Intelligence](./Swarm.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Definition](#definition)
2. [The Quadratic Bottleneck](#the-quadratic-bottleneck)
3. [Taxonomy of Approaches](#taxonomy-of-approaches)
4. [Linear Attention and Recurrent Hybrids](#linear-attention-and-recurrent-hybrids)
5. [State Space Models](#state-space-models)
6. [Sparse and Hybrid Attention](#sparse-and-hybrid-attention)
7. [Convolution-Based Alternatives](#convolution-based-alternatives)
8. [Differential and Noise-Canceling Attention](#differential-and-noise-canceling-attention)
9. [Gated Linear Attention (GLA)](#gated-linear-attention-gla)
10. [Notable Models and Architectures](#notable-models-and-architectures)
11. [Performance Comparisons](#performance-comparisons)
12. [Advantages and Trade-offs](#advantages-and-trade-offs)
13. [Challenges and Open Problems](#challenges-and-open-problems)
14. [Relevance to Chac](#relevance-to-chac)
15. [Key Research Papers](#key-research-papers)
16. [References](#references)

---

## Definition

**Sub-quadratic sparse-attention architectures** are neural network designs that reduce the computational and memory complexity of standard transformer attention from O(n²) to something cheaper — typically O(n), O(n log n), or O(n√n) — where n is the sequence length. The goal is to match or exceed full attention quality while enabling models to process sequences of thousands to millions of tokens.

These architectures fall into several families:
- **Linear attention** — replaces the softmax attention matrix with a factored kernel approximation
- **State space models (SSMs)** — recasts sequence mixing as a continuous-time dynamical system
- **Sparse attention** — attends to only a subset of tokens (local, global, or learned)
- **Convolution-based** — uses long convolutions or implicit parameterizations
- **Hybrid approaches** — combines two or more of the above, often layer-by-layer

### Key Insight

> Full attention computes an n×n similarity matrix. Sub-quadratic methods avoid materializing this matrix entirely — either by replacing it with a low-rank factorization, a recurrent state, a sparse pattern, or a convolution.

---

## The Quadratic Bottleneck

### Standard Self-Attention

Given a sequence of n tokens with dimension d, standard attention computes:

```
Attention(Q, K, V) = softmax(QKᵀ / √d) · V
```

This requires:
- **Compute**: O(n²d) — every token attends to every other token
- **Memory**: O(n²) — the attention matrix must be stored (or recomputed)
- **KV Cache**: O(n) per layer during inference — grows linearly with context length

### Why It Matters

| Sequence Length | Attention Matrix Size | KV Cache (per layer) |
|----------------|----------------------|---------------------|
| 1K tokens | 1M entries | ~1 MB |
| 8K tokens | 64M entries | ~8 MB |
| 32K tokens | 1B entries | ~32 MB |
| 128K tokens | 16B entries | ~128 MB |
| 1M tokens | 1T entries | ~1 GB |

For a 70B parameter model with 80 layers, a 128K context requires ~10 GB just for the KV cache — often exceeding the model's own parameter memory on consumer GPUs.

### FlashAttention: O(n²) Made Efficient

FlashAttention (Dao et al., 2022) doesn't reduce the algorithmic complexity — it's still O(n²) — but makes the constant factor much smaller through:
- Tiling to exploit GPU SRAM hierarchy
- Avoiding materialization of the full n×n matrix
- Online softmax computation

FlashAttention is the practical baseline that sub-quadratic methods must beat in wall-clock time, not just Big-O.

---

## Taxonomy of Approaches

```
Sub-Quadratic Attention
├── Linear Attention / Recurrent Hybrids
│   ├── Linear Transformers (Katharopoulos et al., 2020)
│   ├── RWKV (Peng et al., 2023)
│   ├── RetNet (Sun et al., 2023)
│   ├── Based (Arora et al., 2024)
│   ├── GLA (Yang et al., 2024)
│   ├── Gated DeltaNet (Yang et al., 2024)
│   ├── Kimi Delta Attention / Kimi Linear (2025)
│   └── Gated DeltaNet-2 (Hatamizadeh et al., 2026)
├── State Space Models
│   ├── S4 (Gu et al., 2022)
│   ├── Mamba (Gu & Dao, 2023)
│   ├── Mamba-2 (Dao & Gu, 2024)
│   └── Differential Mamba (Schneider et al., 2025)
├── Sparse / Hybrid Attention
│   ├── Longformer (Beltagy et al., 2020)
│   ├── BigBird (Zaheer et al., 2020)
│   ├── Routing Transformers (Roy et al., 2020)
│   ├── Native Sparse Attention / NSA (Yuan et al., 2025)
│   ├── Gated Sparse Attention (Shen & Shen, 2026)
│   └── Block Sparse Flash Attention (Ohayon et al., 2025)
├── Convolution-Based
│   ├── Hyena Hierarchy (Poli et al., 2023)
│   ├── H3 (Fu et al., 2023)
│   └── Griffin (De et al., 2024)
└── Differential / Noise-Canceling
    ├── Differential Transformer (Ye et al., 2024)
    └── Differential Mamba (Schneider et al., 2025)
```

---

## Linear Attention and Recurrent Hybrids

### Core Idea

Replace the softmax attention matrix QKᵀ with a factored approximation using kernel functions φ:

```
Standard:  Attention = softmax(QKᵀ/√d) · V
Linear:    Attention = φ(Q)(φ(K)ᵀV) / φ(Q)(φ(K)ᵀ1)
```

The key trick: compute φ(K)ᵀV first (a d×d matrix), then multiply by φ(Q). This gives O(nd²) compute — linear in sequence length n.

### Linear Transformers (Katharopoulos et al., 2020)

**Paper**: "Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention"

**Key Innovation**: Show that linear attention can be formulated as a recurrent neural network:
```
S_t = S_{t-1} + φ(k_t)v_tᵀ    (state update)
z_t = z_{t-1} + φ(k_t)         (normalization)
o_t = φ(q_t)ᵀS_t / φ(q_t)ᵀz_t (output)
```

**Result**: Training parallelism of transformers with O(1) inference memory.

**Limitation**: Without gating, the fixed-size state forgets old information, leading to poor long-range dependency modeling.

### RWKV: Reinventing RNNs (Peng et al., 2023)

**Paper**: "RWKV: Reinventing RNNs for the Transformer Era"

**Architecture**: Combines the parallelizable training of transformers with the efficient inference of RNNs using a linear attention mechanism called **Receptance Weighted Key Value**.

**Key Innovation**: A token-shifted linear attention with a time-decay factor:
```
wkv_t = (Σ_{i=1}^{t-1} e^{-(t-1-i)w + k_i} v_i + e^{k_t} v_t) / (Σ denominator)
```

**Scaling**: Trained up to 14B parameters — by far the largest dense RNN at the time. Performance on par with similarly-sized transformers.

**Versions**:
- **RWKV-4** (2023): Original architecture
- **RWKV-5 "Eagle"** (2024): Multi-headed matrix-valued states + dynamic recurrence
- **RWKV-6 "Finch"** (2024): Further improvements on Eagle, competitive with transformers at 1.6B-3.1B scale

### RetNet: Retention Network (Sun et al., 2023)

**Paper**: "Retentive Network: A Successor to Transformer for Large Language Models"

**Three Computation Modes**:
1. **Parallel** (training): Full attention-like parallelism for fast training
2. **Recurrence** (inference): O(1) per-step inference with fixed-size state
3. **Chunkwise** (chunked inference): Balance between parallel and recurrent for long sequences

**Key Innovation**: The **retention mechanism** — a gated linear attention with exponential decay:
```
Retention(Q, K, V) = (QKᵀ ⊙ D) · V
where D_ij = γ^{i-j} for i ≥ j, 0 otherwise
```

γ is a per-head decay rate that controls how quickly past information fades.

**Results**: Competitive with transformers on language modeling, speech recognition, and time-series analysis. The survey (Yang et al., 2025) documents cross-domain effectiveness.

### Based (Arora et al., 2024)

**Paper**: "Simple Linear Attention Language Models Balance the Recall-Throughput Tradeoff"

**Key Insight**: Linear attention alone excels at throughput but struggles with recall (retrieving specific facts). Based adds a small number of full-attention layers at the top of the model to handle recall, while the bulk of the model uses linear attention.

**Architecture**: Linear attention layers + sparse full-attention layers at specific positions.

**Result**: Better recall than pure linear attention, better throughput than pure full attention.

---

## State Space Models

### S4: Structured State Spaces (Gu et al., 2022)

**Paper**: "Efficiently Modeling Long Sequences with Structured State Spaces" (ICLR 2022, Outstanding Paper HM)

**Core Idea**: Model sequences using a continuous-time state space:
```
x'(t) = Ax(t) + Bu(t)
y(t)  = Cx(t) + Du(t)
```

Discretized, this becomes a linear recurrence — O(n) compute and O(1) per-step inference.

**Key Innovation**: A special parameterization of A using the **HiPPO** (High-order Polynomial Projection Operator) framework, which allows the state to efficiently compress long-range history.

**Results**:
- 91% on sequential CIFAR-10 (no data augmentation)
- Solved Path-X (sequence length 16K) — all prior work failed
- Generation 60x faster than transformers

### Mamba: Selective State Spaces (Gu & Dao, 2023)

**Paper**: "Mamba: Linear-Time Sequence Modeling with Selective State Spaces"

**Key Innovation**: **Selectivity** — the SSM parameters (B, C, Δ) are input-dependent, not fixed. This allows the model to selectively focus on or ignore inputs, mimicking attention's content-based routing.

**Architecture**: Selective SSM + hardware-aware parallel scan algorithm.

**Results**:
- Matches transformers of similar size on language modeling
- Linear scaling in both training and inference
- 5x faster than transformers at sequence length 64K

### Mamba-2 (Dao & Gu, 2024)

**Paper**: "Transformers are SSMs: Generalized Models and Efficient Algorithms Through Structured State Space Duality"

**Key Insight**: Proved a **duality** between structured state space models and a form of linear attention. This unifies the two approaches and enables:
- More efficient training via matrix multiplication
- Better hardware utilization
- Competitive performance with full attention at scale

### Differential Mamba (Schneider et al., 2025)

**Paper**: "Differential Mamba" (AACL 2025)

**Key Innovation**: Applies the differential attention principle (from Differential Transformer) to Mamba's state space model. Uses the difference between two softmax attention maps to cancel noise in intermediate representations.

**Results**:
- Reduces hallucinations
- Improves long-range retrieval
- More robust to noisy context

---

## Sparse and Hybrid Attention

### Longformer (Beltagy et al., 2020)

**Paper**: "Longformer: The Long-Document Transformer"

**Pattern**: Local sliding-window attention + task-motivated global attention:
- Each token attends to a local window of w neighbors
- Special tokens (CLS, question tokens) attend globally to all tokens
- Complexity: O(n × w) — linear in sequence length

### BigBird (Zaheer et al., 2020)

**Paper**: "Big Bird: Transformers for Longer Sequences"

**Pattern**: Local attention + global attention + random attention:
- Local: each token attends to w neighbors
- Global: a set of randomly chosen tokens attend to all
- Random: each token attends to r random tokens

**Theoretical guarantee**: Proven to be a universal sequence approximator.

### Routing Transformers (Roy et al., 2020)

**Paper**: "Efficient Content-Based Sparse Attention with Routing Transformers"

**Key Innovation**: Cluster tokens by content (not position) and route each token to attend only to tokens in the same cluster. Complexity: O(n × √n).

### Native Sparse Attention / NSA (Yuan et al., 2025)

**Paper**: "Native Sparse Attention: Hardware-Aligned and Natively Trainable Sparse Attention" (DeepSeek)

**Key Innovation**: A **dynamic hierarchical sparse strategy** that combines:
1. **Coarse-grained token compression** — compress blocks of tokens into summary representations
2. **Fine-grained token selection** — select the most relevant tokens from the compressed representations
3. **Sliding-window local attention** — preserve local precision

**Hardware Optimization**: Arithmetic intensity-balanced algorithm design that achieves substantial speedups on modern GPUs.

**Results**:
- Maintains or exceeds full attention across benchmarks
- Substantial speedups on 64K-length sequences (decoding, forward, backward)
- End-to-end trainable (not just inference-efficient)

### Gated Sparse Attention (Shen & Shen, 2026)

**Paper**: "Gated Sparse Attention: Combining Computational Efficiency with Training Stability"

**Key Innovation**: Combines sparse attention (attend to selected tokens) with gated attention variants (improve training stability). The gating mechanism controls which tokens to attend to and how much weight to assign.

### Block Sparse Flash Attention (Ohayon et al., 2025)

**Paper**: "Block Sparse Flash Attention"

**Key Innovation**: A drop-in replacement for FlashAttention that accelerates long-context inference by exploiting block-level sparsity. Tokens are grouped into blocks, and entire blocks that are unlikely to be relevant are skipped.

---

## Convolution-Based Alternatives

### Hyena Hierarchy (Poli et al., 2023)

**Paper**: "Hyena Hierarchy: Towards Larger Convolutional Language Models"

**Key Innovation**: A subquadratic drop-in replacement for attention built from:
1. **Implicitly parameterized long convolutions** — data-controlled (input-dependent) convolution filters
2. **Data-controlled gating** — element-wise multiplication with learned gate vectors

**Architecture**: Interleave convolution and gating operations in a hierarchical structure.

**Results**:
- 50+ point improvement over state-space methods on recall/reasoning tasks
- Matches transformer quality with 20% less training compute at sequence length 2K
- 2x faster than optimized attention at 8K, 100x faster at 64K

---

## Differential and Noise-Canceling Attention

> **Note**: The Differential Transformer achieves O(n²) complexity — same as standard attention. It belongs in this document because it demonstrates a key principle: attention *quality* can be improved without reducing algorithmic complexity. This is relevant to sub-quadratic research because noise-canceling techniques can be combined with sparse or linear attention to get both efficiency and quality gains.

### Differential Transformer (Ye et al., 2024)

**Paper**: "Differential Transformer" (ICLR 2025, Oral)

**Key Innovation**: Compute attention as the **difference** between two separate softmax attention maps:
```
DiffAttn(X) = (softmax(Q₁K₁ᵀ/√d) - λ · softmax(Q₂K₂ᵀ/√d)) · V
```

The subtraction cancels noise from irrelevant context, promoting sparse attention patterns.

**Results**:
- Outperforms standard transformer across scaling settings
- Reduces hallucinations in QA and summarization
- More robust to in-context learning order permutation
- Reduces activation outliers (easier to quantize)

### Differential Mamba (Schneider et al., 2025)

Extends the differential principle to Mamba's SSM. Uses two parallel Mamba streams and takes their difference to cancel noise.

---

## Gated Linear Attention (GLA)

### Theory (Li et al., 2025)

**Paper**: "Gating is Weighting: Understanding Gated Linear Attention through In-context Learning"

**Key Finding**: A multilayer GLA model implements **Weighted Preconditioned Gradient Descent (WPGD)** algorithms with data-dependent weights. The gating mechanism controls how much each token contributes to prediction.

### Gated DeltaNet (Yang et al., 2024)

Combines GLA with the **delta rule** — a classic learning rule from neuroscience that subtracts the current read before writing new values. This prevents the recurrent state from growing unboundedly.

### Gated DeltaNet-2 (Hatamizadeh et al., 2026)

**Paper**: "Gated DeltaNet-2: Decoupling Erase and Write in Linear Attention" (NVIDIA)

**Key Innovation**: Separates the **erase** and **write** operations with independent channel-wise gates:
- **Erase gate** (b_t): controls how much old content to remove
- **Write gate** (w_t): controls how much new content to commit

**Results at 1.3B parameters** (100B tokens):
- Strongest overall among Mamba-2, Gated DeltaNet, KDA, and Mamba-3 variants
- Best performance on long-context RULER needle-in-haystack benchmarks
- Works in both recurrent and hybrid settings

### Kimi Delta Attention / Kimi Linear (Kimi Team, 2025)

**Paper**: "Kimi Linear: An Expressive, Efficient Attention Architecture"

**Key Innovation**: Extends Gated DeltaNet with a **finer-grained gating mechanism** that enables more effective use of limited finite-state RNN memory. Uses a bespoke chunkwise algorithm with Diagonal-Plus-Low-Rank (DPLR) transition matrices.

**Architecture**: 3B activated parameters, 48B total (MoE), layerwise hybrid of KDA and Multi-Head Latent Attention (MLA).

**Results**:
- **First hybrid linear attention to outperform full attention** under fair comparisons
- Outperforms full MLA across short-context, long-context, and RL scaling
- KV cache reduction: up to 75%
- Decoding throughput: up to 6x for 1M context

---

## Notable Models and Architectures

| Model | Year | Type | Complexity | Key Innovation |
|-------|------|------|------------|----------------|
| Linear Transformers | 2020 | Linear Attention | O(n) | RNN formulation of attention |
| Longformer | 2020 | Sparse | O(n·w) | Local + global attention |
| BigBird | 2020 | Sparse | O(n·w) | Local + global + random |
| Routing Transformers | 2020 | Sparse | O(n√n) | Content-based routing |
| S4 | 2022 | SSM | O(n) | HiPPO + structured SSM |
| Hyena | 2023 | Convolution | O(n log n) | Data-controlled long convolutions |
| RWKV-4 | 2023 | Linear Attention | O(n) | Token-shifted linear attention |
| RetNet | 2023 | Linear Attention | O(n) | Retention with decay |
| Mamba | 2023 | SSM | O(n) | Selective (input-dependent) SSM |
| RWKV-5/6 | 2024 | Linear Attention | O(n) | Matrix-valued states |
| Mamba-2 | 2024 | SSM/Linear | O(n) | SSM-attention duality |
| Differential Transformer | 2024 | Quality Improvement | O(n²) | Noise-canceling via subtraction (not sub-quadratic) |
| Based | 2024 | Hybrid | O(n) + sparse | Linear bulk + sparse top layers |
| GLA | 2024 | Linear Attention | O(n) | Gated linear attention theory |
| Gated DeltaNet | 2024 | Linear Attention | O(n) | Delta rule + gating |
| NSA | 2025 | Sparse | O(n) | Hardware-aligned hierarchical sparse |
| Kimi Linear | 2025 | Hybrid Linear | O(n) | Outperforms full attention |
| Differential Mamba | 2025 | SSM + Differential | O(n) | Noise-canceling SSM |
| Gated DeltaNet-2 | 2026 | Linear Attention | O(n) | Decoupled erase/write gates |

---

## Performance Comparisons

> **Note**: The numbers below are approximate, compiled from multiple papers and reports. Exact figures vary by hardware, model size, and implementation. Treat these as directional, not precise benchmarks.

### Long-Context Benchmark (RULER Needle-in-Haystack)

| Architecture | 4K | 16K | 64K | 128K |
|-------------|-----|------|------|------|
| Full Attention | 100% | 99% | 95% | 85% |
| Mamba | 98% | 90% | 60% | — |
| RWKV-6 | 97% | 88% | 55% | — |
| Gated DeltaNet | 99% | 95% | 75% | 60% |
| Kimi Linear | 100% | 98% | 92% | 85% |
| NSA | 99% | 97% | 90% | 80% |

### Throughput at 64K Context

| Architecture | Tokens/sec (relative) | KV Cache |
|-------------|----------------------|----------|
| Full Attention + FlashAttn | 1.0x | 64K × d |
| Mamba | 5.0x | Fixed state |
| RWKV-6 | 4.5x | Fixed state |
| Kimi Linear | 6.0x | 16K × d (75% reduction) |
| NSA | 2.5x | Variable (sparse) |

### Training Compute (WikiText103)

| Model | PPL | Training FLOPs (relative) |
|-------|-----|--------------------------|
| Transformer | 15.2 | 1.0x |
| Hyena | 15.5 | 0.8x |
| Mamba | 14.8 | 0.9x |
| Kimi Linear | 14.5 | 0.85x |

---

## Advantages and Trade-offs

### Advantages

| Benefit | Explanation |
|---------|-------------|
| **Longer Context** | O(n) or O(n log n) enables processing 100K+ tokens affordably |
| **Lower Memory** | Fixed-size recurrent state vs. growing KV cache |
| **Faster Inference** | O(1) per-step decoding (recurrent modes) |
| **Edge Deployment** | Smaller memory footprint enables on-device inference |
| **Training Efficiency** | Often requires less FLOPs than full attention |

### Trade-offs

| Challenge | Explanation |
|-----------|-------------|
| **Recall Degradation** | Linear/recurrent models struggle with exact retrieval of specific facts |
| **Training Complexity** | Many variants require custom CUDA kernels or specialized algorithms |
| **Expressiveness** | Fixed-size state may not capture all attention patterns |
| **Hybrid Overhead** | Mixing linear and full attention adds architectural complexity |
| **Ecosystem Maturity** | Full attention has vastly more tooling, optimization, and community support |

### When to Use What

| Use Case | Recommended Approach |
|----------|---------------------|
| **Long documents (100K+ tokens)** | Linear attention (Kimi Linear, RWKV) or NSA |
| **Retrieval-heavy tasks** | Hybrid (Based, Kimi Linear with MLA layers) |
| **Edge/mobile deployment** | RWKV or Mamba (O(1) inference memory) |
| **Balanced quality/speed** | Gated DeltaNet-2 or Kimi Linear |
| **Maximum quality (short context)** | Full attention + FlashAttention |

---

## Challenges and Open Problems

### 1. The Recall-Throughput Tradeoff

Linear attention excels at throughput but struggles with recall (retrieving specific facts from long contexts). Hybrid approaches (Based, Kimi Linear) partially address this, but the fundamental tension remains.

**Solution direction**: Content-based sparse attention (NSA) or hybrid architectures with selective full-attention layers.

### 2. Training Instability

Many sub-quadratic variants (especially early linear attention models) suffer from training instability — gradient explosions, NaN losses, or failure to converge.

**Solutions**: Gating mechanisms (GLA, Gated DeltaNet), delta rule subtraction, layer normalization placement.

### 3. Hardware Optimization Gap

Most sub-quadratic algorithms are theoretically faster but lack the years of CUDA kernel optimization that FlashAttention has received. The wall-clock advantage can be smaller than the Big-O advantage suggests.

**Solutions**: Hardware-aligned algorithm design (NSA), custom CUDA kernels (Kimi Linear), operator fusion.

### 4. Scalability to Frontier Scale

Most sub-quadratic models have been demonstrated at 1B-13B parameters. It's unclear whether the advantages hold at 70B+ scale where full attention's expressiveness may matter more.

**Solution direction**: Kimi Linear's 48B MoE model is a promising data point, but more frontier-scale experiments are needed.

### 5. Multimodal Extension

Most sub-quadratic architectures are designed for 1D sequences (text). Extending to 2D (images) or 3D (video) requires additional design decisions about how to structure the recurrent state or sparse pattern.

**Solutions**: Vision Mamba, ViR (Vision Retention Networks), multi-dimensional Hyena.

---

## Relevance to Chac

Chac currently uses llama.cpp with standard attention for its LLM and embedding models. Sub-quadratic architectures are relevant to Chac in several ways:

1. **Longer document contexts** — Chac's document ingestion pipeline chunks text into 500-character segments. A model with sub-quadratic attention could process entire documents without chunking, preserving context that chunking loses.

2. **Embedding model evolution** — The nomic-embed-text-v2-moe embedding model Chac uses is an MoE architecture. Future embedding models may combine MoE with linear attention for even better efficiency-accuracy tradeoffs.

3. **Local deployment** — Sub-quadratic models' lower memory requirements make them ideal for Chac's USB-drive deployment model. A RWKV or Mamba model could run on lower-end hardware than a full-attention model of equivalent quality.

4. **The Kimi Linear result** — The first hybrid linear attention to outperform full attention suggests that the quality gap is closing. As these models mature and get GGUF quantization support, they could become viable replacements for Chac's current llama.cpp models (MiniCPM5-1B for chat, nomic-embed-text-v2-moe for embeddings).

---

## Key Research Papers

### Foundational

| Paper | Year | Key Contribution |
|-------|------|-----------------|
| Linear Transformers | 2020 | Showed linear attention can be formulated as RNN |
| Longformer | 2020 | Local + global sparse attention |
| BigBird | 2020 | Proven universal approximation via sparse attention |
| Routing Transformers | 2020 | Content-based token routing |

### State Space Models

| Paper | Year | Key Contribution |
|-------|------|-----------------|
| S4 | 2022 | HiPPO + structured SSM, solved Path-X |
| Mamba | 2023 | Selective (input-dependent) SSM |
| Mamba-2 | 2024 | SSM-attention duality proof |

### Linear Attention Hybrids

| Paper | Year | Key Contribution |
|-------|------|-----------------|
| RWKV | 2023 | Token-shifted linear attention, 14B scale |
| RetNet | 2023 | Three-mode retention (parallel/recurrent/chunkwise) |
| Hyena | 2023 | Data-controlled long convolutions |
| Based | 2024 | Linear bulk + sparse top layers |
| GLA | 2024 | Gated linear attention theory |
| Gated DeltaNet | 2024 | Delta rule + gating for linear attention |
| RWKV-5/6 | 2024 | Matrix-valued states, dynamic recurrence |

### Cutting Edge (2025–2026)

| Paper | Year | Key Contribution |
|-------|------|-----------------|
| Differential Transformer | 2024 | Noise-canceling via attention subtraction |
| NSA | 2025 | Hardware-aligned hierarchical sparse attention |
| Kimi Linear | 2025 | First hybrid linear to outperform full attention |
| Differential Mamba | 2025 | Noise-canceling SSM |
| Gated DeltaNet-2 | 2026 | Decoupled erase/write gates |
| Gated Sparse Attention | 2026 | Gating + sparse attention combined |

---

## References

1. Katharopoulos, A. et al. (2020). "Transformers are RNNs: Fast Autoregressive Transformers with Linear Attention." *ICML 2020*.
2. Beltagy, I. et al. (2020). "Longformer: The Long-Document Transformer." *arXiv:2004.05150*.
3. Zaheer, M. et al. (2020). "Big Bird: Transformers for Longer Sequences." *NeurIPS 2020*.
4. Roy, A. et al. (2020). "Efficient Content-Based Sparse Attention with Routing Transformers." *TACL 2020*.
5. Gu, A. et al. (2022). "Efficiently Modeling Long Sequences with Structured State Spaces." *ICLR 2022*.
6. Poli, M. et al. (2023). "Hyena Hierarchy: Towards Larger Convolutional Language Models." *arXiv:2302.10866*.
7. Peng, B. et al. (2023). "RWKV: Reinventing RNNs for the Transformer Era." *arXiv:2305.13048*.
8. Sun, Y. et al. (2023). "Retentive Network: A Successor to Transformer for Large Language Models." *arXiv:2307.08621*.
9. Gu, A. & Dao, T. (2023). "Mamba: Linear-Time Sequence Modeling with Selective State Spaces." *arXiv:2312.00752*.
10. Dao, T. & Gu, A. (2024). "Transformers are SSMs: Generalized Models and Efficient Algorithms Through Structured State Space Duality." *ICML 2024*.
11. Peng, B. et al. (2024). "Eagle and Finch: RWKV with Matrix-Valued States and Dynamic Recurrence." *arXiv:2404.05892*.
12. Yang, S. et al. (2024). "Gated Linear Attention Transformers with Hardware-Efficient Training." *ICML 2024*.
13. Arora, S. et al. (2024). "Simple Linear Attention Language Models Balance the Recall-Throughput Tradeoff." *arXiv:2402.18668*.
14. Ye, T. et al. (2024). "Differential Transformer." *ICLR 2025 (Oral)*.
15. Yuan, J. et al. (2025). "Native Sparse Attention: Hardware-Aligned and Natively Trainable Sparse Attention." *arXiv:2502.11089*.
16. Kimi Team. (2025). "Kimi Linear: An Expressive, Efficient Attention Architecture." *arXiv:2510.26692*.
17. Schneider, N. et al. (2025). "Differential Mamba." *AACL 2025*.
18. Yang, H. et al. (2025). "A Survey of Retentive Network." *arXiv:2506.06708*.
19. Li, Y. et al. (2025). "Gating is Weighting: Understanding Gated Linear Attention through In-context Learning." *arXiv:2504.04308*.
20. Ohayon, D. et al. (2025). "Block Sparse Flash Attention." *arXiv:2512.07011*.
21. Hatamizadeh, A. et al. (2026). "Gated DeltaNet-2: Decoupling Erase and Write in Linear Attention." *arXiv:2605.22791*.
22. Shen, A. & Shen, A. (2026). "Gated Sparse Attention: Combining Computational Efficiency with Training Stability." *arXiv:2601.15305*.
