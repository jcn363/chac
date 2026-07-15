# Running LLMs on CPU and RAM: Optimal Performance Guide

> "The best hardware is the hardware you already have." — llama.cpp philosophy

**See also:** [The Karpathy Method](./Karpathy.md) · [Mixture of Experts](./MoE.md) · [Sub-Quadratic Attention](./Sub-quadratic.md) · [DSpark Speculative Decoding](./Dspark.md) · [GGUF Format](./gguf.md) · [Sakana Fugu](./Fugu.md) · [ObsidianSA](./ObsidianSA.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Definition](#definition)
2. [Relevance to Chac](#relevance-to-chac)
3. [The CPU Inference Landscape](#the-cpu-inference-landscape)
4. [Quantization: The Primary Lever](#quantization-the-primary-lever)
5. [Memory Architecture: RAM Requirements](#memory-architecture-ram-requirements)
6. [CPU Instruction Sets and SIMD](#cpu-instruction-sets-and-simd)
7. [Threading and Parallelism](#threading-and-parallelism)
8. [Memory Mapping (mmap)](#memory-mapping-mmap)
9. [Context Size Optimization](#context-size-optimization)
10. [KV Cache Quantization](#kv-cache-quantization)
11. [Batch Size Tuning](#batch-size-tuning)
12. [Apple Silicon vs x86: Two Worlds](#apple-silicon-vs-x86-two-worlds)
13. [Model Selection for CPU](#model-selection-for-cpu)
14. [Practical Optimization Checklist](#practical-optimization-checklist)
15. [Benchmarks: What to Expect](#benchmarks-what-to-expect)
16. [Advanced Techniques](#advanced-techniques)
17. [References](#references)

---

## Definition

**CPU-and-RAM inference** refers to running large language models (LLMs) entirely on the CPU and system memory, without dedicated GPU hardware. This approach trades raw throughput for universal availability — every computer has a CPU and RAM, but not every computer has a GPU.

The key insight is that modern CPUs with sufficient RAM can run quantized LLMs at usable speeds, especially for small-to-medium models (1B–7B parameters). llama.cpp, the dominant CPU inference engine, has optimized this path to the point where CPU-only inference is practical for production applications like Chac.

---

## Relevance to Chac

Chac is designed as a **portable RAG application** that runs from a USB drive. This design constraint makes CPU inference not just a preference but a necessity:

1. **Portability**: USB drives travel between machines with unknown GPU configurations. CPU inference guarantees the application works everywhere.

2. **Chac's current models**: MiniCPM5-1B (chat), nomic-embed-text-v2-moe (embeddings), and MiniCPM-V-4.6 (vision) are all small enough for efficient CPU inference.

3. **Dual-model architecture**: Chac runs two separate llama-server instances — one for chat, one for embeddings. CPU optimization must account for memory sharing between both processes.

4. **USB drive deployment**: The full stack (binary + models) fits on a USB drive. Model quantization choices directly impact whether this is feasible — a 7B Q8 model is ~7GB, while a 1B Q4 model is ~600MB.

5. **Graceful degradation**: When no GPU is available, Chac should still function. The optimization target is "usable on CPU" — not "fast as GPU."

---

## The CPU Inference Landscape

### Why CPU Inference Works

LLM inference is fundamentally a matrix multiplication workload. While GPUs excel at massive parallelism across thousands of cores, CPUs compensate with:

- **Wider SIMD registers**: AVX-512 processes 16 FP32 values per cycle per core
- **Higher clock speeds**: Modern CPUs run at 3–6 GHz vs GPU cores at 1–2 GHz
- **Massive cache hierarchy**: L3 caches of 16–64MB keep hot data close
- **Memory bandwidth**: DDR5 reaches 50–80 GB/s, sufficient for small models

### The Bottleneck

Token generation (decode) is memory-bandwidth-bound: each token requires loading the entire weight matrix. For a 1B parameter model at Q4 quantization (~600MB), DDR4 at 40 GB/s can load all weights in ~15ms, yielding a theoretical maximum of ~67 tokens/second. Real-world performance is typically 30–60% of this theoretical maximum.

Prefill (processing the prompt) is compute-bound: the model processes all prompt tokens in parallel. This phase benefits more from SIMD and threading.

### Key Distinction: Prefill vs Decode

| Phase | Bound By | Bottleneck | CPU Optimization Target |
|-------|----------|-----------|----------------------|
| Prefill | Compute | Matrix multiplication throughput | SIMD width, thread count |
| Decode | Memory bandwidth | Weight loading per token | Quantization, mmap, memory speed |

---

## Quantization: The Primary Lever

Quantization reduces model weights from FP16 (16-bit floating point) to lower precision integers, dramatically reducing memory footprint and improving inference speed on CPU.

### Quantization Levels

| Format | Bits/Weight | Size (1B model) | Quality Loss | CPU Speed |
|--------|------------|-----------------|-------------|-----------|
| FP16 | 16 | 2.0 GB | None (baseline) | 1.0x |
| Q8_0 | 8 | 1.0 GB | Negligible | 1.5–2.0x |
| Q6_K | 6 | 750 MB | Very minor | 2.0–2.5x |
| Q5_K_M | 5 | 650 MB | Minor | 2.5–3.0x |
| Q4_K_M | 4 | 550 MB | Noticeable on complex tasks | 3.0–4.0x |
| Q4_0 | 4 | 500 MB | Moderate | 3.5–4.5x |
| Q3_K_M | 3 | 420 MB | Significant on reasoning | 4.0–5.0x |
| Q2_K | 2 | 320 MB | Severe degradation | 5.0–6.0x |
| IQ2_XXS | ~2 | 280 MB | Experimental | 5.0–6.0x |
| IQ1_M | ~1 | 180 MB | Research only | 6.0–8.0x |

### K-Quant Family (Recommended for CPU)

The K-quant family (`Q4_K_M`, `Q5_K_M`, `Q6_K`) uses block-wise quantization with importance-based bit allocation — critical layers (attention, first/last layers) get higher precision while less important layers get lower precision. This achieves better quality than uniform quantization at the same size.

**Recommended for Chac**: `Q4_K_M` for chat (best size/quality trade-off), `Q5_K_M` for embeddings (slightly higher quality for better semantic search).

### Importance Quantization (IQ)

Newer IQ formats (`IQ4_XS`, `IQ3_XXS`, `IQ2_XXS`) use even more aggressive quantization with superblock structures. These achieve smaller sizes but with more quality degradation. Best suited for extremely memory-constrained environments.

### Quantizing Custom Models

```bash
# Quantize a Hugging Face model to GGUF Q4_K_M
python convert_hf_to_gguf.py model_dir --outfile model-f16.gguf
./llama-quantize model-f16.gguf model-q4_k_m.gguf Q4_K_M
```

---

## Memory Architecture: RAM Requirements

### Total Memory Formula

```
Total RAM = Model weights + KV cache + Context overhead + OS + Other processes
```

### Model Weight Memory

| Model Size | FP16 | Q8 | Q6_K | Q4_K_M | Q3_K_M |
|-----------|------|-----|------|--------|--------|
| 1B | 2.0 GB | 1.0 GB | 750 MB | 550 MB | 420 MB |
| 3B | 6.0 GB | 3.0 GB | 2.3 GB | 1.7 GB | 1.3 GB |
| 7B | 14 GB | 7.0 GB | 5.3 GB | 4.0 GB | 3.0 GB |
| 13B | 26 GB | 13 GB | 10 GB | 7.5 GB | 5.8 GB |

### KV Cache Memory

The KV cache stores attention keys and values for all previous tokens in the context window. Its size depends on:

```
KV cache = 2 × n_layers × n_heads × head_dim × ctx_size × bytes_per_element
```

For a typical 1B model with 2K context:
- FP16 KV cache: ~200 MB
- Q8 KV cache: ~100 MB
- Q4 KV cache: ~50 MB

**Key insight**: KV cache scales linearly with context length. A 4K context uses 2x the KV cache of 2K. This is why context size is the primary memory control knob for CPU inference.

### Practical RAM Guidelines

| Available RAM | Max Model | Context Size | Quantization |
|--------------|-----------|-------------|-------------|
| 4 GB | 1B | 1K–2K | Q4_K_M |
| 8 GB | 3B | 2K–4K | Q4_K_M |
| 16 GB | 7B | 4K–8K | Q4_K_M |
| 32 GB | 13B | 8K–16K | Q5_K_M |
| 64 GB | 30B+ | 16K–32K | Q6_K |

---

## CPU Instruction Sets and SIMD

SIMD (Single Instruction, Multiple Data) is the most impactful CPU feature for LLM inference. Modern CPUs support progressively wider SIMD operations:

### x86/x64 (Intel/AMD)

| Instruction Set | Register Width | FP32/cycle | FP16/cycle | Availability |
|----------------|---------------|------------|------------|-------------|
| SSE4.1 | 128-bit | 4 | — | 2008+ |
| AVX | 256-bit | 8 | — | 2011+ |
| AVX2 | 256-bit | 8 | 16 (F16C) | 2013+ |
| AVX-512 | 512-bit | 16 | 32 | 2016+ (server), 2021+ (client) |
| AMX | Tile-based | 256+ | 512+ | 2023+ (Sapphire Rapids) |

**Key for llama.cpp**: AVX2 is the baseline for good CPU performance. AVX-512 provides 1.5–2x speedup on supported hardware. AMX provides another 2x on Intel 4th gen Xeon+.

### ARM (Apple Silicon, Raspberry Pi, etc.)

| Instruction Set | Register Width | Use Case | Availability |
|----------------|---------------|----------|-------------|
| NEON | 128-bit | All ARM64 | 2012+ |
| SVE/SVE2 | 128–2048-bit | Server ARM (Graviton, Ampere) | 2021+ |
| Apple AMX | 2048-bit | Apple M1+ | 2020+ |

**Apple Silicon advantage**: M1/M2/M3/M4 chips have unified memory architecture (UMA) — CPU and GPU share the same RAM pool. This eliminates the CPU↔GPU data transfer bottleneck and provides excellent memory bandwidth (100–400 GB/s on M-series).

### Checking Your CPU

```bash
# Linux
lscpu | grep "Flags" | tr ' ' '\n' | grep -E "avx|amx|sse"

# macOS
sysctl -a | grep machdep.cpu.features

# llama.cpp built-in
llama-bench -m model.gguf -t 1  # single-thread baseline
```

---

## Threading and Parallelism

### Thread Count Optimization

The optimal thread count depends on the model size, CPU cores, and memory bandwidth:

**Rule of thumb**: Use `min(n_physical_cores, n_layers)` threads.

- **Too few threads**: Underutilizes compute
- **Too many threads**: Increases memory contention and cache thrashing
- **Sweet spot**: Usually 50–75% of physical cores

```bash
# Use all physical cores (not hyperthreads)
llama-server -m model.gguf -t $(nproc)

# Conservative: half the cores (often faster for memory-bound models)
llama-server -m model.gguf -t $(( $(nproc) / 2 ))

# Pin to specific cores for consistent latency
llama-server -m model.gguf -t 4 --affinity 0-3
```

### Threading Strategy

llama.cpp uses different thread pools for different operations:

- **Compute threads** (`-t`): Used for matrix multiplication during inference
- **Batch threads** (`-tb`): Used for prompt processing (prefill)
- **GPU threads** (`-tg`): Used when offloading layers to GPU

For CPU-only inference, only `-t` matters. Setting `-t` to the number of physical cores (not hyperthreads) is optimal for most workloads.

### NUMA Awareness

On multi-socket servers (dual Xeon, dual EPYC), NUMA topology matters:

```bash
# Detect NUMA nodes
numactl --hardware

# Pin to local NUMA node for best memory latency
numactl --cpunodebind=0 --membind=0 llama-server -m model.gguf
```

---

## Memory Mapping (mmap)

mmap is one of the most impactful optimizations for CPU inference. It allows the operating system to load model weights on-demand from disk rather than loading the entire model into RAM upfront.

### How It Works

```
Traditional load:  Disk → RAM → CPU (entire model loaded)
mmap load:         Disk ←→ RAM ←→ CPU (pages loaded on demand)
```

Benefits:
- **Reduced RSS**: Only pages actually accessed consume physical RAM
- **Faster startup**: No need to wait for full model load
- **OS page cache**: Hot pages stay in memory, cold pages swap to disk
- **Shared memory**: Multiple processes can share the same mmap'd model

### llama.cpp mmap Behavior

llama.cpp uses mmap by default for both model loading and the KV cache:

- **Model weights**: mmap'd from GGUF file (default: enabled)
- **KV cache**: Can be mmap'd for large contexts (`--mlock` prevents swapping)

### Recommendations

```bash
# Default (mmap enabled, best for most cases)
llama-server -m model.gguf

# Lock model in memory (prevents swapping, but uses more RAM upfront)
llama-server -m model.gguf --mlock

# Disable mmap (rarely beneficial, only if model is small and RAM is abundant)
llama-server -m model.gguf --no-mmap
```

**For Chac on USB**: mmap works well with USB drives, but USB read speeds (100–400 MB/s for USB 3.x) are slower than SSDs. For frequently used models, copying to local SSD first is recommended. The OS page cache will keep hot pages in RAM after the first access.

### USB Drive Specifics

| USB Version | Sequential Read | Random 4K Read | Suitability |
|------------|----------------|----------------|-------------|
| USB 2.0 | 25–40 MB/s | ~1 MB/s | Poor — model loading takes minutes |
| USB 3.0 | 100–200 MB/s | ~5 MB/s | Adequate for small models (1–3B) |
| USB 3.1 Gen 2 | 400–800 MB/s | ~10 MB/s | Good — comparable to SATA SSD |
| USB 3.2 Gen 2x2 | 1–2 GB/s | ~20 MB/s | Excellent — near NVMe speeds |

**FAT32 limitation**: USB drives formatted as FAT32 cannot store files larger than 4GB. A 7B Q4_K_M model is ~4GB — right at the limit. Format as exFAT or NTFS for larger models.

**Recommendation**: For Chac's 1B models (~600MB each), USB 3.0+ is sufficient. For larger models, copy to local disk or use USB 3.1+ with exFAT formatting.

---

## Context Size Optimization

Context size is the single largest controllable factor in memory usage for CPU inference.

### Memory Impact

```
KV cache memory ≈ 2 × layers × dim × ctx_size × quantization_bytes
```

For a 1B model:
- 2K context: ~200 MB KV cache
- 4K context: ~400 MB
- 8K context: ~800 MB
- 16K context: ~1.6 GB
- 32K context: ~3.2 GB

### Optimal Context for CPU

| Use Case | Recommended Context | Reasoning |
|----------|-------------------|-----------|
| Embeddings | 512–2048 | Embedding models rarely need long context |
| Simple chat | 2048–4096 | Most conversations are short |
| RAG with documents | 4096–8192 | Need room for retrieved chunks + conversation |
| Document analysis | 8192–16384 | Long documents need larger windows |
| Code review | 8192–16384 | Large code context needed |

**Chac recommendation**: 
- Chat model: 4096 tokens (balances quality and memory)
- Embedding model: 2048 tokens (sufficient for document chunks)
- Total memory: ~550 MB (Q4 chat) + ~400 MB (Q4 embeddings) + ~600 MB (KV caches) ≈ 1.5 GB for both models

---

## KV Cache Quantization

KV cache quantization reduces the memory footprint of the attention cache without re-quantizing model weights.

### How It Works

During inference, the key-value pairs for each attention head are stored in the KV cache at reduced precision (Q4 or Q8 instead of FP16).

```bash
# Enable Q8 KV cache (default in newer llama.cpp)
llama-server -m model.gguf -c 4096 -dt 0.5 --cache-type-k q8_0 --cache-type-v q8_0

# Enable Q4 KV cache (aggressive memory saving)
llama-server -m model.gguf -c 4096 --cache-type-k q4_0 --cache-type-v q4_0
```

### Quality Impact

- **Q8 KV cache**: Negligible quality loss, 50% memory reduction
- **Q4 KV cache**: Minor quality loss on complex reasoning, 75% memory reduction

### KV Cache Memory Comparison (1B model, 4K context)

| KV Cache Type | Memory | Quality |
|--------------|--------|---------|
| FP16 | 400 MB | Baseline |
| Q8_0 | 200 MB | ≈ Baseline |
| Q4_0 | 100 MB | Minor degradation |

---

## Batch Size Tuning

Batch size controls how many tokens are processed simultaneously during prompt prefill.

### For CPU Inference

- **Large batch** (512+): Better utilization of SIMD units during prefill
- **Small batch** (64–128): Lower peak memory, faster first token
- **Default** (512): Good balance for most use cases

```bash
# Larger batch for prefill-heavy workloads (RAG with long documents)
llama-server -m model.gguf -ub 1024

# Smaller batch for interactive chat (lower latency)
llama-server -m model.gguf -ub 256
```

### Batch Size vs Memory

```
Peak memory = Model weights + KV cache + Batch working memory
Batch working memory ≈ batch_size × hidden_dim × 2 × n_layers × bytes
```

For a 1B model, batch working memory ranges from ~50 MB (batch=64) to ~400 MB (batch=1024).

---

## Apple Silicon vs x86: Two Worlds

### Apple Silicon (M1/M2/M3/M4)

**Advantages:**
- Unified memory architecture (UMA) — no CPU↔GPU data transfer
- High memory bandwidth (100–400 GB/s)
- AMX accelerator (2048-bit) for matrix operations
- Efficient ARM NEON SIMD
- Excellent performance-per-watt

**Performance expectations:**
| Model | M1 (8GB) | M1 Pro (16GB) | M1 Max (64GB) |
|-------|----------|---------------|---------------|
| 1B Q4 | 40–60 tok/s | 50–70 tok/s | 60–80 tok/s |
| 3B Q4 | 15–25 tok/s | 20–35 tok/s | 30–45 tok/s |
| 7B Q4 | 8–12 tok/s | 12–20 tok/s | 18–30 tok/s |

**Optimization tips:**
- Use `--mlock` to prevent model from swapping (UMA makes this critical)
- Apple Accelerate framework is auto-detected by llama.cpp
- Metal backend is available for GPU offloading, but CPU-only often sufficient for small models

### x86 (Intel/AMD)

**Advantages:**
- Wider SIMD (AVX-512: 512-bit vs NEON: 128-bit)
- AMX on server CPUs (Sapphire Rapids+)
- Higher core counts (16–64 cores on consumer/server)
- Larger L3 caches (16–128 MB)

**Disadvantages:**
- Split CPU/GPU memory (no UMA unless using integrated graphics)
- Lower memory bandwidth than Apple Silicon (40–80 GB/s DDR4, 50–80 GB/s DDR5)
- Higher power consumption

**Performance expectations:**
| Model | Intel i7 (DDR4) | Intel i9 (DDR5) | AMD Ryzen 9 (DDR5) |
|-------|----------------|----------------|-------------------|
| 1B Q4 | 20–35 tok/s | 30–50 tok/s | 35–55 tok/s |
| 3B Q4 | 8–15 tok/s | 15–25 tok/s | 18–30 tok/s |
| 7B Q4 | 4–8 tok/s | 8–15 tok/s | 10–18 tok/s |

**Optimization tips:**
- Compile llama.cpp with `-DGGML_AVX512=ON` if CPU supports it
- Use `--no-mmap` if model fits entirely in RAM (avoids page fault overhead)
- Pin threads to performance cores on hybrid architectures (Intel 12th gen+)
- DDR5 provides significant bandwidth improvement over DDR4

---

## Model Selection for CPU

### Criteria for CPU-Friendly Models

1. **Small parameter count** (≤3B): Fits in RAM with room for KV cache
2. **Efficient architecture**: Fewer layers, wider attention, fewer parameters per layer
3. **Good quantization behavior**: Maintains quality at Q4/Q3 precision
4. **Active community**: GGUF versions available on Hugging Face

### Recommended Models for CPU

| Model | Parameters | Q4 Size | CPU Speed (1B Q4) | Quality |
|-------|-----------|---------|-------------------|---------|
| MiniCPM5-1B | 1B | 600 MB | 40–60 tok/s | Good for Chinese+English |
| Qwen2.5-1.5B | 1.5B | 900 MB | 25–40 tok/s | Strong multilingual |
| Phi-3-mini (3.8B) | 3.8B | 2.2 GB | 10–18 tok/s | Excellent reasoning |
| Gemma-2-2B | 2B | 1.2 GB | 20–35 tok/s | Good instruction following |
| SmolLM-1.7B | 1.7B | 1.0 GB | 25–40 tok/s | Efficient for its size |

### Embedding Models for CPU

| Model | Parameters | Q5 Size | Speed | Quality |
|-------|-----------|---------|-------|---------|
| nomic-embed-text-v2-moe | 275M | 170 MB | 200+ tok/s | Excellent (MoE) |
| all-MiniLM-L6-v2 | 22M | 25 MB | 1000+ tok/s | Good baseline |
| bge-small-en-v1.5 | 33M | 30 MB | 800+ tok/s | Strong retrieval |

---

## Practical Optimization Checklist

### Step 1: Choose the Right Quantization

```
Q4_K_M: Best default for CPU inference
  → 3-4x smaller than FP16
  → 3-4x faster than FP16
  → Minimal quality loss for most tasks
```

### Step 2: Set Context Size to Minimum Viable

```
Embeddings:  2048 (sufficient for document chunks)
Chat:        4096 (balances quality and memory)
Code:        8192 (when large code context is needed)
```

### Step 3: Optimize Thread Count

```bash
# Start with physical core count
-threads $(nproc --all 2>/dev/null || echo 4)

# If performance is poor, try halving
-threads $(( $(nproc --all 2>/dev/null || echo 8) / 2 ))
```

### Step 4: Enable KV Cache Quantization

```bash
# Q8 KV cache (recommended)
--cache-type-k q8_0 --cache-type-v q8_0

# Q4 KV cache (aggressive memory saving)
--cache-type-k q4_0 --cache-type-v q4_0
```

### Step 5: Use mmap (Default)

```bash
# mmap is enabled by default — only override for small models
# --mlock: pin model in RAM (good if model < 50% of RAM)
# --no-mmap: load entirely (only if model is small and RAM is abundant)
```

### Step 6: Monitor and Adjust

```bash
# Watch memory usage
watch -n 1 'free -h'  # Linux
top -l 1 | head -n 5  # macOS

# Benchmark performance
llama-bench -m model.gguf -t $(nproc)
```

---

## Benchmarks: What to Expect

### Token Generation Speed (tokens/second, decode only)

| Hardware | 1B Q4 | 3B Q4 | 7B Q4 | Notes |
|----------|-------|-------|-------|-------|
| Apple M1 8GB | 50 | 20 | 10 | UMA advantage |
| Apple M3 Pro 18GB | 70 | 30 | 18 | Higher bandwidth |
| Intel i7-12700 (DDR4) | 30 | 12 | 6 | AVX-512 |
| AMD Ryzen 7 7800X3D (DDR5) | 45 | 20 | 10 | Good gaming CPU |
| Intel Xeon w9-3595X (DDR5) | 55 | 25 | 14 | Server grade |
| Raspberry Pi 5 (8GB) | 8 | 3 | 1.5 | ARM Cortex-A76 |

### Prompt Processing Speed (tokens/second, prefill)

Prefill is much faster than decode because it processes all tokens in parallel:

| Hardware | 1B Q4 (pp512) | 3B Q4 (pp512) |
|----------|---------------|---------------|
| Apple M3 Pro | 3000–4000 | 1200–1800 |
| Intel i7-12700 | 1500–2500 | 600–1000 |
| Raspberry Pi 5 | 200–400 | 80–150 |

### Memory Usage (steady state)

| Component | 1B Q4 | 3B Q4 | 7B Q4 |
|-----------|-------|-------|-------|
| Model weights | 600 MB | 1.7 GB | 4.0 GB |
| KV cache (4K ctx) | 200 MB | 600 MB | 1.5 GB |
| Working memory | 100 MB | 300 MB | 800 MB |
| **Total** | **900 MB** | **2.6 GB** | **6.3 GB** |

---

## Advanced Techniques

### 1. Self-Speculative Decoding

LayerSkip (arXiv:2404.16710) enables self-speculative decoding where early layers draft tokens and later layers verify them, all within a single model. This can provide 1.5–2x speedup on CPU without requiring a separate draft model.

```bash
# llama.cpp supports speculative decoding with a draft model
llama-server -m model.gguf -md draft_model.gguf
```

### 2. CPU+GPU Hybrid Inference

Even partial GPU offloading can dramatically improve CPU inference:

```bash
# Offload 80% of layers to GPU, keep 20% on CPU
llama-server -m model.gguf -ngl 80

# Split between CPU and multiple GPUs
llama-server -m model.gguf -ts 2,1  # 2:1 ratio between GPU 0 and GPU 1
```

### 3. Model Merging

Combining multiple quantized models can sometimes yield better quality than a single larger quantization:

```bash
# Merge LoRA adapters into base model
python merge_lora.py --base model.gguf --lora adapter.gguf --output merged.gguf
```

### 4. Flash Attention (GPU)

Flash attention reduces KV cache memory by computing attention in tiled blocks. Note: this is primarily a **GPU optimization** in llama.cpp — the CUDA/Metal kernels implement the tiled attention pattern. For CPU-only inference, the equivalent memory optimization is KV cache quantization (see [KV Cache Quantization](#kv-cache-quantization) section above).

```bash
# Flash attention is enabled by default in newer llama.cpp (GPU only)
llama-server -m model.gguf --flash-attn  # enable (default, GPU only)
llama-server -m model.gguf --no-flash-attn  # disable
```

### 5. Continuous Batching

For serving multiple users on CPU, continuous batching maximizes throughput:

```bash
# Serve 4 parallel requests
llama-server -m model.gguf -c 16384 -np 4
```

---

## References

1. Gerganov, G. (2023–2026). "llama.cpp: LLM inference in C/C++." https://github.com/ggml-org/llama.cpp

2. GGML Team. "GGUF Specification." https://github.com/ggml-org/ggml/blob/master/docs/gguf.md

3. llama.cpp. "Quantize Tool." https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md

4. Elhoushi, M., et al. (2024). "LayerSkip: Enabling Early Exit Inference and Self-Speculative Decoding." ACL 2024. arXiv:2404.16710. https://arxiv.org/abs/2404.16710

5. Dettmers, T., et al. (2023). "GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers." arXiv:2210.17323. https://arxiv.org/abs/2210.17323

6. Lin, J., et al. (2024). "AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration." MLSys 2024. arXiv:2306.00978. https://arxiv.org/abs/2306.00978

7. llama.cpp Wiki. "Performance Troubleshooting." https://github.com/ggml-org/llama.cpp/blob/master/docs/development/token_generation_performance_tips.md

8. Apple. "Accelerate Framework." https://developer.apple.com/accelerate/

---

**See also:** [The Karpathy Method](./Karpathy.md) · [Mixture of Experts](./MoE.md) · [Sub-Quadratic Attention](./Sub-quadratic.md) · [DSpark Speculative Decoding](./Dspark.md) · [GGUF Format](./gguf.md) · [Sakana Fugu](./Fugu.md) · [ObsidianSA](./ObsidianSA.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)
