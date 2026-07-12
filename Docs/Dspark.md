# DSpark: Confidence-Scheduled Speculative Decoding with Semi-Autoregressive Generation

> "The next wave of AI performance gains will not come only from larger models. It will also come from smarter ways to run the models companies already have." — VentureBeat

**See also:** [MoE](./MoE.md) · [MLA Deep-Dive](./MLA.md) · [Sub-Quadratic Attention](./Sub-quadratic.md) · [Swarm Intelligence](./Swarm.md) · [GPT Architecture](./GPT.md) · [The Karpathy Method](./Karpathy.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Definition](#definition)
2. [Background: Speculative Decoding](#background-speculative-decoding)
3. [The Two Bottlenecks](#the-two-bottlenecks)
4. [Architecture](#architecture)
5. [Semi-Autoregressive Generation](#semi-autoregressive-generation)
6. [Confidence-Scheduled Verification](#confidence-scheduled-verification)
7. [DeepSeek-V4 Integration](#deepseek-v4-integration)
8. [Benchmarks and Results](#benchmarks-and-results)
9. [Community Adoption](#community-adoption)
10. [Relevance to Chac](#relevance-to-chac)
11. [References](#references)

---

## Definition

**DSpark** is a speculative decoding framework released by DeepSeek-AI on June 27, 2026, that accelerates LLM inference by 60–85% without changing model quality. It is **not a new language model** — it is a serving optimization module that attaches to existing model checkpoints.

- **Paper**: arXiv:2607.05147
- **Code**: [github.com/deepseek-ai/DeepSpec](https://github.com/deepseek-ai/DeepSpec) (MIT license)
- **Checkpoints**: [huggingface.co/deepseek-ai/DeepSeek-V4-Pro-DSpark](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro-DSpark)
- **Authors**: Xin Cheng, Xingkai Yu, Chenze Shao, Jiashi Li, Yunfan Xiong, et al. (Peking University + DeepSeek-AI)

---

## Background: Speculative Decoding

### The Problem

LLMs generate text autoregressively — each new token requires a full forward pass conditioned on all preceding tokens. Inference latency is proportional to output length, resulting in low GPU utilization and high user-perceived waiting time.

### How Speculative Decoding Works

Speculative decoding decouples **draft generation** from **target verification**:

1. A lightweight **draft model** proposes a block of γ candidate tokens in a single forward pass
2. The full-size **target model** verifies all candidates in a single parallel forward pass
3. The longest prefix consistent with the target distribution is accepted, plus one bonus token
4. Verification preserves the target distribution **exactly** — no quality loss

The per-token latency becomes:

```
L = (T_draft + T_verify) / τ
```

where τ is the number of accepted tokens per cycle. Improving speedup reduces to three levers: draft faster (lower T_draft), draft better (higher τ), or verify smarter (lower effective T_verify).

### Drafter Architectures

| Type | Draft Speed | Acceptance Rate | Block Size |
|------|-------------|-----------------|------------|
| **Autoregressive** (EAGLE-3, MTP) | T_draft ∝ γ (linear) | High (models inter-token dependencies) | Small γ |
| **Parallel** (DFlash) | T_draft ≈ constant | Lower suffix (no inter-token dependencies) | Large γ (e.g. 16) |

---

## The Two Bottlenecks

DSpark addresses two critical problems that limit existing speculative decoding approaches:

### 1. Suffix Decay in Parallel Drafters

Parallel drafters produce all γ tokens in one forward pass, but each position is predicted independently. When the context admits multiple plausible continuations (e.g., "of course" vs "no problem"), a parallel drafter may produce incoherent combinations like "of problem" or "no course" — cross-mode collisions. Acceptance rate decays rapidly at later positions, wasting both draft and verification compute.

### 2. Wasted Verification Under Load

Indiscriminately verifying all proposed tokens degrades system throughput, especially under high concurrency:

- **Data axis**: Structured tasks (code, math) yield high acceptance; open-ended chat yields low acceptance
- **System axis**: Under light load, extra verification is nearly free; under heavy load, every unnecessary verification occupies batch capacity that could serve other active requests

---

## Architecture

DSpark resolves these bottlenecks with two complementary components:

```
Target Model → Anchor Token → DSpark Drafter → Draft Tokens + Confidence Scores
                                ↓
                    Parallel Backbone (DFlash)
                                ↓
                    Sequential Head (Markov/RNN)
                                ↓
                    Hardware-Aware Prefix Scheduler
                                ↓
                    Target Model Verification
```

---

## Semi-Autoregressive Generation

DSpark splits draft generation into two stages:

### Parallel Stage

A DFlash backbone runs a single forward pass over the entire block, producing hidden states h₁,…,hγ and base logits U₁,…,Uγ. All positions attend bidirectionally to each other and to injected target context features.

### Sequential Stage

A lightweight sequential module supplements the base logits with a prefix-dependent transition bias:

```
p_k(v | x₀, x_{<k}) = exp(U_k(v) + B_k(x₀, x_{<k}, v)) / Σ exp(U_k(u) + B_k(x₀, x_{<k}, u))
```

Two instantiations:

**Markov Head**: Depends only on the immediately preceding token. Low-rank factorization B = W₁W₂ (r=256) keeps storage and compute small. Once position 1 samples "of", the Markov head boosts "course" and suppresses "problem" at position 2.

**RNN Head**: Maintains a recurrent state s_k that accumulates full prefix history within a block. Uses gated update:

```
s_k = σ(W_g · z_k) ⊙ s_{k-1} + (1 - σ(W_g · z_k)) ⊙ tanh(W_c · z_k)
```

where z_k = [s_{k-1}; W₁[x_{k-1}]; h_k].

### Key Insight

> "A little autoregression goes a long way." The sequential stage is computationally lightweight (T_sequential ≪ T_parallel) but dramatically improves suffix coherence.

---

## Confidence-Scheduled Verification

### Confidence Head

Outputs a scalar c_k ∈ (0,1) for each draft position, modeling the conditional probability that the token at position k survives verification given all preceding tokens accepted:

```
c_k = σ(w^T [h_k; W₁[x_{k-1}]])
```

Supervised using the analytical acceptance rate:

```
c_k* = 1 - ½‖p_k^d - p_k^t‖₁
```

### Hardware-Aware Prefix Scheduler

Dynamically determines optimal verification length per request based on:

1. **Prefix survival probabilities** from the confidence head
2. **Real-time engine throughput profiles** (system load)

Under light load → verify longer prefixes. Under heavy load → trim low-confidence trailing tokens before they consume batch capacity.

### Lossless Guarantee

DSpark maintains a strict **early-stopping** mechanism that prevents selection bias. The admission decision for each token depends only on pre-token information, preserving the non-anticipating property required for lossless speculative decoding.

---

## DeepSeek-V4 Integration

DSpark is deployed on DeepSeek's production V4 models:

| Model | Total Params | Active Params | Context | Speedup |
|-------|-------------|---------------|---------|---------|
| **V4-Flash** | 284B | 13B | 1M tokens | 60–85% |
| **V4-Pro** | 1.6T | 49B | 1M tokens | 57–78% |

### V4 Architecture Features

- **Hybrid Attention**: Processes 1M context using only 10% KV cache and 27% FLOPs vs V3.2
- **Mixed FP4/FP8 precision**
- **Manifold-Constrained Hyper-Connections (mHC)** for training stability
- **Three dynamic reasoning modes**: Non-think (fast), Think High (analytical), Think Max (maximum reasoning)
- **Out-of-the-box support** for vLLM and SGLang

---

## Benchmarks and Results

### Offline (Controlled Benchmarks)

Tested on Qwen3-4B, Qwen3-8B, Qwen3-14B, and Gemma4-12B across math, coding, and chat:

| Comparison | Qwen3-4B | Qwen3-8B | Qwen3-14B |
|------------|----------|----------|-----------|
| DSpark vs **EAGLE-3** (accepted length) | +30.9% | +26.7% | +30.0% |
| DSpark vs **DFlash** (accepted length) | +16.3% | +18.4% | +18.3% |

### Online (Live Production Traffic)

| Metric | V4-Flash | V4-Pro |
|--------|----------|--------|
| Per-user generation speedup (matched throughput) | 60–85% | 57–78% |
| Aggregate throughput at strict SLA | +661% | +406% |

The extreme throughput numbers (661%, 406%) occur because MTP-1 approaches an operational cliff at strict speed targets (120 TPS/user for Flash, 50 TPS/user for Pro), while DSpark maintains robust throughput by avoiding wasted verification.

### Community Early Results

Developer Rafael Caricio reported on single-stream V4-Flash:
- No spec decoding: 26.33 tok/s
- MTP-1: 39.88 tok/s
- **DSpark: ~60 tok/s** (1.51× over MTP-1, 2.29× over non-spec)

---

## Community Adoption

### What Developers Get

- **DeepSpec repository**: Full training pipeline (data prep → target cache → train → evaluate)
- **Released checkpoints** for Qwen3 (4B, 8B, 14B) and Gemma4-12B
- **Evaluation suite**: GSM8K, MATH-500, AIME 2025, coding benchmarks

### Deployment Caveats

- Default Qwen3-4B setup requires ~38 TB target cache storage
- Scripts assume single node with 8 GPUs
- More relevant to AI labs, cloud teams, and enterprise infrastructure than individual developers

### Model Compatibility

DSpark is **not** limited to DeepSeek-V4. The method can travel to other open-weight models when the operator controls the weights and serving stack. A drafter trained for DeepSeek-V4 will not automatically work for a different model — alignment training is required.

---

## Relevance to Chac

DSpark has direct implications for Chac's local LLM serving:

### Inference Speed

Chac uses llama.cpp as its local inference backend. DSpark-style speculative decoding could reduce chat response latency by 60–85%, dramatically improving the interactive experience. The DeepSpec framework could eventually be adapted for llama.cpp-compatible draft models.

### MTP Already in Chac

Chac already has a `llm.mtp.enabled` setting that supports Multi-Token Prediction. DSpark builds on MTP principles but adds the semi-autoregressive sequential head and confidence-scheduled verification — a natural evolution of the same idea.

### Model Hot-Swap

Chac's model hot-swap infrastructure (`LlmServiceImpl.restartInstance()`) could be extended to load DSpark draft modules alongside target model checkpoints, enabling speculative decoding without architectural changes.

### Open-Source Alignment

DSpark's MIT license and open checkpoints align with Chac's local-first, open-source philosophy. The DeepSpec training pipeline could be used to create custom draft modules for models that Chac serves locally.

---

## References

1. Cheng, X., Yu, X., Shao, C., et al. "DSpark: Confidence-Scheduled Speculative Decoding with Semi-Autoregressive Generation." arXiv:2607.05147, July 6, 2026.
2. DeepSeek-AI. "DeepSeek-V4-Pro-DSpark." huggingface.co/deepseek-ai/DeepSeek-V4-Pro-DSpark, June 27, 2026.
3. DeepSeek-AI. "DeepSpec: Algorithm-Driven Training Repository for Speculative Decoding." github.com/deepseek-ai/DeepSpec, June 27, 2026.
4. Chen, C., et al. "DFlash: High-Throughput Parallel Drafting for Speculative Decoding." 2026.
5. Li, Y., et al. "EAGLE-3: Autoregressive Drafting with Tree-Based Verification." 2026.
6. Leviathan, Y., et al. "Fast Inference from Transformers via Speculative Decoding." arXiv:2211.17192, 2022.
7. Cai, T., et al. "Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads." 2024.
8. DeepSeek-AI. "Insights into DeepSeek-V3: Scaling Challenges and Reflections on Hardware for AI Architectures." ISCA 2025.
9. VentureBeat. "DeepSeek open sources DSpark, a new framework to speed up LLM inference by up to 85%." June 29, 2026.
10. Caricio, R. "Spark vLLM Docker: Single-stream DSpark benchmarks." github.com/rafaelcaricio/spark_vllm_docker, 2026.
