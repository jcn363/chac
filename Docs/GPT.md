# GPT: Generative Pre-trained Transformer

> "The transformer is the foundation. Everything else is an optimization."

**See also:** [Sub-Quadratic Attention](./Sub-quadratic.md) · [MLA Deep-Dive](./MLA.md) · [SSA Deep-Dive](./SSA.md) · [Mixture of Experts](./MoE.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [The Transformer Decoder](#the-transformer-decoder)
4. [Training](#training)
5. [Evolution](#evolution)
6. [Key Innovations](#key-innovations)
7. [The Quadratic Bottleneck](#the-quadratic-bottleneck)
8. [Modern GPT Variants](#modern-gpt-variants)
9. [GPT vs Encoder-Decoder vs Decoder-Only](#gpt-vs-encoder-decoder-vs-decoder-only)
10. [Relevance to Chac](#relevance-to-chac)
11. [References](#references)

---

## Overview

GPT (Generative Pre-trained Transformer) is a family of autoregressive language models based on the transformer decoder architecture. Introduced by OpenAI (2018–present), GPT demonstrated that scaling a simple architecture with massive data and compute produces emergent capabilities — in-context learning, reasoning, and instruction following — that smaller models cannot achieve.

GPT is not just a model family. It is the **dominant architecture** underlying virtually all modern large language models: GPT-4, Claude, LLaMA, Mistral, DeepSeek, Qwen, and the MiniCPM5-1B used by Chac are all decoder-only transformer variants.

---

## Architecture

### Core Components

A GPT model consists of stacked transformer decoder layers:

```
Input Tokens → Embedding + Positional Encoding
  → [Transformer Block] × N layers
    → Layer Norm → Masked Multi-Head Attention → Residual
    → Layer Norm → Feed-Forward Network → Residual
  → Final Layer Norm
  → Linear Projection → Softmax → Next Token
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `d_model` | Hidden dimension (e.g., 4096 for GPT-3 175B) |
| `n_layers` | Number of transformer blocks (e.g., 96 for GPT-3) |
| `n_heads` | Number of attention heads (e.g., 96 for GPT-3) |
| `d_head` | Dimension per head (`d_model / n_heads`) |
| `d_ff` | Feed-forward intermediate dimension (typically 4 × d_model) |
| `vocab_size` | Token vocabulary size (e.g., 50,257 for GPT-3) |
| `ctx_length` | Maximum sequence length (e.g., 2048 for GPT-3, 128K for GPT-4) |

### Parameter Count Formula

For a standard GPT model with `L` layers:

```
Parameters ≈ 12 × L × d_model²  (for d_ff = 4 × d_model)
```

| Model | Layers | d_model | Parameters |
|-------|--------|---------|------------|
| GPT-1 | 12 | 768 | 117M |
| GPT-2 | 48 | 1600 | 1.5B |
| GPT-3 | 96 | 12288 | 175B |
| GPT-4 | ~120 | ~12288 | ~1.8T (estimated) |

---

## The Transformer Decoder

### Self-Attention (Masked)

The core operation of GPT is **masked self-attention**. Unlike the original transformer's bidirectional attention, GPT uses **causal masking** — each token can only attend to previous tokens:

```
Attention(Q, K, V) = softmax(QKᵀ / √d_h) · V
```

Where:
- `Q = X W_Q` — Query projection
- `K = X W_K` — Key projection
- `V = X W_V` — Value projection
- Mask: Upper triangular matrix (prevents attending to future tokens)

**Complexity**: O(n² · d_h) per attention layer, where n is sequence length.

### Why O(n²)?

Every token computes a similarity score with every other token:

```
Token 1: scores against tokens [1, 2, 3, ..., n]
Token 2: scores against tokens [1, 2, 3, ..., n]
...
Token n: scores against tokens [1, 2, 3, ..., n]
```

This produces an n×n attention matrix. For 128K tokens, that's 16 billion entries — the fundamental scaling bottleneck.

### Feed-Forward Network

Each transformer block also contains a feed-forward network:

```
FFN(x) = GELU(x W_1 + b_1) W_2 + b_2
```

Where `W_1 ∈ R^{d_model × d_ff}` and `W_2 ∈ R^{d_ff × d_model}`. This is where most model parameters reside (~2/3 of total parameters).

### Positional Encoding

GPT uses **learned positional embeddings** (GPT-1/2) or **rotary positional embeddings (RoPE)** (modern variants like LLaMA, DeepSeek). RoPE encodes relative positions through rotation matrices, enabling better length generalization.

### Layer Normalization

Modern GPT models use **Pre-LN** (normalization before attention/FFN) instead of the original Post-LN. This stabilizes training at scale.

---

## Training

### Pre-training Objective

GPT is trained with **next-token prediction** (causal language modeling):

```
Loss = -Σ log P(x_t | x_1, ..., x_{t-1})
```

The model learns to predict the next token given all previous tokens. This simple objective, scaled to massive datasets, produces emergent capabilities.

### Training Data

| Model | Data | Tokens |
|-------|------|--------|
| GPT-1 | BookCorpus | 800M |
| GPT-2 | WebText | 40B |
| GPT-3 | Common Crawl + Books + Wikipedia | 300B |
| GPT-4 | Not disclosed | ~13T (estimated) |

### Scaling Laws

Kaplan et al. (2020) discovered that model performance scales as a power law with:

1. **Model size** (parameters)
2. **Dataset size** (tokens)
3. **Compute** (FLOPs)

The key insight: performance improves predictably when you scale all three together. This justified the massive investments in larger models and datasets.

Chinchilla (Hoffmann et al., 2022) refined this: the optimal ratio is ~20 tokens per parameter. A 70B model performs best with ~1.4T tokens.

### Training Infrastructure

Modern GPT training requires:
- **Thousands of GPUs** (A100/H100) running in parallel
- **Data parallelism** — replicate model across GPUs, split data
- **Tensor parallelism** — split individual layers across GPUs
- **Pipeline parallelism** — split model depth across GPU groups
- **Mixed precision** — FP16/BF16 for compute, FP32 for master weights
- **Gradient checkpointing** — trade compute for memory

Training GPT-3 costs ~$4.6M in compute. Training GPT-4 costs ~$100M+.

---

## Evolution

### GPT-1 (2018)

**Paper**: "Improving Language Understanding by Generative Pre-Training"

- 117M parameters, 12 layers
- Pre-trained on BookCorpus (800M tokens)
- Fine-tuned on downstream tasks (classification, NLI, QA)
- **Key insight**: Unsupervised pre-training + supervised fine-tuning works

### GPT-2 (2019)

**Paper**: "Language Models are Unsupervised Multitask Learners"

- 1.5B parameters, 48 layers
- Trained on WebText (40B tokens, filtered from Reddit)
- Zero-shot performance on multiple tasks
- **Key insight**: Scale enables zero-shot generalization (no fine-tuning needed)

### GPT-3 (2020)

**Paper**: "Language Models are Few-Shot Learners"

- 175B parameters, 96 layers
- Trained on 300B tokens
- In-context learning: few-shot examples in the prompt improve performance
- **Key insight**: Scale enables in-context learning (no gradient updates needed)

### GPT-4 (2023)

- ~1.8T parameters (estimated, MoE architecture)
- Multimodal (text + images)
- 128K context window
- Human-level performance on many benchmarks
- **Key insight**: Multimodal training + massive scale approaches human capability

### GPT-4o (2024)

- Native multimodal (text, audio, images, video)
- Real-time voice interaction
- 128K context, 16K output
- **Key insight**: Unified multimodal model with real-time interaction

---

## Key Innovations

### In-Context Learning (GPT-3)

The most significant innovation of GPT-3: the model can learn from examples provided in the prompt, without any gradient updates.

```
Prompt:
Translate English to French:
sea otter => loutre de mer
peppermint => menthe poivrée
plush girafe => ???

Model output: girafe en peluche
```

This emerged from scale — GPT-2 could not do this reliably. The mechanism is still not fully understood.

### Instruction Tuning

After pre-training, models are fine-tuned on instruction-response pairs:

```
Instruction: Summarize the following text.
Input: [long text]
Output: [summary]
```

This aligns the model to follow human instructions rather than just predicting the next token. Used in GPT-3.5, GPT-4, and all modern chat models.

### RLHF (Reinforcement Learning from Human Feedback)

1. Collect human comparisons of model outputs (which response is better?)
2. Train a reward model on these comparisons
3. Fine-tune the language model using PPO (Proximal Policy Optimization) to maximize reward

This aligns the model with human preferences — making it helpful, harmless, and honest.

### Constitutional AI (Anthropic)

An alternative to RLHF where the model is trained to follow a set of principles (a "constitution"):

1. Generate responses
2. Critique responses against principles
3. Revise responses based on critique
4. Train on revised responses

---

## The Quadratic Bottleneck

### The Fundamental Limitation

GPT's masked self-attention has O(n²) complexity:

| Sequence Length | Attention Matrix Size | Compute (relative) |
|----------------|----------------------|-------------------|
| 1K | 1M entries | 1× |
| 4K | 16M entries | 16× |
| 32K | 1B entries | 1,024× |
| 128K | 16B entries | 16,384× |
| 1M | 1T entries | 1,048,576× |

### Why It Matters for Long Context

For a 70B model at 128K context:
- **Attention matrix**: ~16 billion entries per layer
- **KV cache**: ~10 GB per layer
- **Total KV cache**: ~800 GB (80 layers)

This exceeds the memory of any single GPU and often exceeds the model's own parameter memory.

### Mitigations

Modern GPT variants address this through:

| Technique | What It Reduces | How |
|-----------|----------------|-----|
| **FlashAttention** | Memory (not compute) | Tiling + IO-aware computation |
| **GQA** | KV cache memory | Shared KV heads across query groups |
| **MLA** | KV cache memory | Low-rank latent compression |
| **Sparse attention** | Compute | Attend to subset of tokens |
| **Sliding window** | Compute + memory | Local attention + global tokens |
| **Ring Attention** | Memory per device | Distribute attention across nodes |

---

## Modern GPT Variants

### Open-Source GPT Alternatives

| Model | Params | Context | Architecture | Source |
|-------|--------|---------|--------------|--------|
| LLaMA-3 | 8B–405B | 128K | Dense GPT | Meta |
| Mistral | 7B–141B | 32K–128K | MoE + GPT | Mistral AI |
| DeepSeek-V3 | 671B | 128K | MoE + MLA + GPT | DeepSeek |
| Qwen-2.5 | 0.5B–72B | 128K | Dense GPT | Alibaba |
| MiniCPM5-1B | 1B | 4K | Dense GPT | OpenBMB (used by Chac) |

### What Changed from Original GPT

| Component | Original GPT | Modern GPT |
|-----------|-------------|------------|
| Normalization | Post-LN | Pre-LN (RMSNorm) |
| Activation | GELU | SiLU/SwiGLU |
| Position | Learned embeddings | RoPE |
| Attention | MHA | GQA / MLA |
| Vocabulary | BPE (50K) | BPE (100K–150K) |
| Context | 512–2048 | 8K–128K |
| Training | Supervised | RLHF / DPO / Constitutional AI |

---

## GPT vs Encoder-Decoder vs Decoder-Only

### Three Transformer Variants

| Architecture | Example | Attention | Use Case |
|-------------|---------|-----------|----------|
| **Encoder-Decoder** | T5, BART | Bidirectional encoder + Causal decoder | Translation, summarization |
| **Encoder-Only** | BERT | Bidirectional | Classification, NER, embeddings |
| **Decoder-Only (GPT)** | GPT, LLaMA, DeepSeek | Causal (masked) | Text generation, chat, reasoning |

### Why Decoder-Only Won

1. **Simplicity**: One architecture for all tasks (via prompting)
2. **Scaling**: Easier to scale decoder-only than encoder-decoder
3. **In-context learning**: Emerges naturally in decoder-only models
4. **Autoregressive generation**: Natural fit for text generation
5. **Efficiency**: KV caching is simpler in decoder-only

GPT's dominance is not accidental — it reflects the decoder-only architecture's advantages at scale.

---

## Relevance to Chac

### GPT Architecture Underlies Chac's Models

Chac uses two models, both GPT-based:

| Model | Params | Architecture | Role |
|-------|--------|--------------|------|
| MiniCPM5-1B | 1B | Dense GPT | Chat (text generation) |
| nomic-embed-text-v2-moe | 137M | MoE + GPT | Embeddings (vector search) |

Both are decoder-only transformers — the GPT architecture.

### Why GPT Matters for Chac

1. **Local inference**: GPT's autoregressive generation enables streaming responses
2. **Efficiency**: Small GPT models (1B) can run on CPU via llama.cpp
3. **Embedding quality**: GPT-based embedding models (nomic-embed) produce high-quality vectors for RAG retrieval
4. **Ecosystem**: llama.cpp, the backbone of Chac, is optimized specifically for GPT-style decoder-only models

### Limitations of Current GPT Models for Chac

1. **Context window**: MiniCPM5-1B supports 4K–8K context, limiting the amount of document context
2. **Attention cost**: Standard GPT attention is O(n²), limiting context expansion
3. **Quality ceiling**: 1B-parameter models have limited reasoning ability

### Future Directions

| Direction | What It Enables |
|-----------|----------------|
| **Larger GPT models** | Better reasoning, but higher compute cost |
| **MLA/GQA** | Longer context with same memory |
| **SSA/sparse attention** | O(n) compute for long context |
| **MoE** | More parameters with same compute |
| **Quantization** | Larger models on same hardware |

The GPT architecture is evolving to address its limitations — through attention variants (MLA, GQA), compute reduction (SSA, sparse attention), and scaling strategies (MoE).

---

## References

1. Radford, A. et al. (2018). "Improving Language Understanding by Generative Pre-Training." (GPT-1)
2. Radford, A. et al. (2019). "Language Models are Unsupervised Multitask Learners." (GPT-2)
3. Brown, T. et al. (2020). "Language Models are Few-Shot Learners." NeurIPS 2020. (GPT-3)
4. OpenAI. (2023). "GPT-4 Technical Report." arXiv:2303.08774.
5. OpenAI. (2024). "GPT-4o System Card."
6. Vaswani, A. et al. (2017). "Attention Is All You Need." NeurIPS 2017. (Original Transformer)
7. Kaplan, J. et al. (2020). "Scaling Laws for Neural Language Models." arXiv:2001.08361.
8. Hoffmann, J. et al. (2022). "Training Compute-Optimal Large Language Models." (Chinchilla)
9. Touvron, H. et al. (2023). "LLaMA: Open and Efficient Foundation Language Models." arXiv:2302.13971.
10. Touvron, H. et al. (2023). "Llama 2: Open Foundation and Fine-Tuned Chat Models." arXiv:2307.09288.
11. DeepSeek-AI. (2025). "DeepSeek-V3 Technical Report." arXiv:2412.19437.
12. Subversive AI. (2026). "SubQ-1.1-Small Model Card."
