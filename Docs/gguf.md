# GGUF: The Model File Format for Local LLM Inference

> "Single-file deployment — all information needed to load a model is contained in the file." — GGUF specification

**See also:** [CPU+RAM Inference](./cpuram.md) · [The Karpathy Method](./Karpathy.md) · [Mixture of Experts](./MoE.md) · [DSpark Speculative Decoding](./Dspark.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Definition](#definition)
2. [Relevance to Chac](#relevance-to-chac)
3. [History: GGML → GGMF → GGJT → GGUF](#history-ggml--ggmf--ggjt--gguf)
4. [File Structure](#file-structure)
5. [The Header](#the-header)
6. [Metadata Key-Value Pairs](#metadata-key-value-pairs)
7. [Tensor Storage](#tensor-storage)
8. [Naming Convention](#naming-convention)
9. [Quantization Types](#quantization-types)
10. [Quantization Quality Reference](#quantization-quality-reference)
11. [Tokenizer Encoding](#tokenizer-encoding)
12. [Tensor Naming Convention](#tensor-naming-convention)
13. [Conversion Pipeline](#conversion-pipeline)
14. [Importance Matrices (imatrix)](#importance-matrices-imatrix)
15. [Multimodal Components (mmproj)](#multimodal-components-mmproj)
16. [Sharding for Large Models](#sharding-for-large-models)
17. [Practical Guide for Chac](#practical-guide-for-chac)
18. [References](#references)

---

## Definition

**GGUF** (GPT-Generated Unified Format) is the binary file format used by [llama.cpp](https://github.com/ggml-org/llama.cpp) and the broader GGML ecosystem for storing and loading models for inference. It is a single-file format designed for:

- **Fast loading**: mmap-compatible alignment enables memory-mapped access
- **Self-contained**: all metadata, tokenizer, and weights in one file
- **Extensible**: new metadata can be added without breaking existing readers
- **Portable**: no external dependencies needed to load a model

GGUF is the successor to GGML, GGMF, and GGJT formats. It is the standard format for running LLMs locally via llama.cpp, Ollama, LM Studio, GPT4All, and dozens of other tools.

### Key Characteristics

- **Single file**: one `.gguf` file contains everything needed for inference
- **Little-endian by default** (big-endian supported since v3)
- **mmap-compatible**: tensors aligned for direct memory-mapped access
- **Key-value metadata**: extensible metadata (not positional parameters)
- **Multiple quantization types**: 30+ weight encodings from FP32 to 1-bit

---

## Relevance to Chac

GGUF is the **core file format** for Chac's inference pipeline:

1. **All Chac models are GGUF**: chat (MiniCPM5-1B-Q4_K_M), embeddings (nomic-embed-text-v2-moe-Q5_K_M), vision (MiniCPM-V-4.6-F16)

2. **Single-file deployment**: Chac ships models on a USB drive — each model is one `.gguf` file, no directory structures or external tokenizers needed

3. **mmap for USB drives**: GGUF's mmap compatibility means Chac can stream model weights from USB without loading the entire file into RAM

4. **Quantization choice**: The GGUF quantization type directly determines Chac's memory footprint and inference speed — Q4_K_M for chat, Q5_K_M for embeddings

5. **Validation**: Chac validates GGUF files using magic bytes (`0x47475546`) before loading, and SHA256 checksums for integrity verification

6. **Multimodal support**: The mmproj (multimodal projector) GGUF file enables Chac's vision pipeline — a separate GGUF containing the vision encoder and projection layers

---

## History: GGML → GGMF → GGJT → GGUF

| Format | Year | Key Feature | Limitation |
|--------|------|-------------|------------|
| **GGML** | 2022 | Original C tensor library | No versioning, no alignment, no mmap |
| **GGMF** | 2023 | Versioned GGML | Only one version exists |
| **GGJT** | 2023 | Aligned tensors for mmap | Positional hyperparameters, breaking changes on new params |
| **GGUF** | 2023+ | Key-value metadata, extensible | Current standard |

### Why GGUF Won

The earlier formats had critical limitations:

- **No architecture identification**: couldn't tell which model architecture a file belonged to
- **Positional hyperparameters**: adding new parameters was a breaking change
- **No extensibility**: metadata couldn't grow without breaking existing readers
- **Fragmented ecosystem**: GGML, GGMF, GGJT each with different rules

GGUF solved all of these with key-value metadata, explicit tensor counts, and alignment standards. The v3 format added big-endian support.

---

## File Structure

A GGUF file has four sections, stored sequentially:

```
┌─────────────────────────────┐
│        Header               │  Magic, version, tensor count, metadata
├─────────────────────────────┤
│     Metadata KV Pairs       │  Architecture, parameters, tokenizer, etc.
├─────────────────────────────┤
│     Tensor Info Array       │  Name, dimensions, type, offset per tensor
├─────────────────────────────┤
│     Padding (alignment)     │  Pad to ALIGNMENT boundary
├─────────────────────────────┤
│       Tensor Data           │  Raw weight data, aligned to ALIGNMENT
└─────────────────────────────┘
```

All fields are stored sequentially without alignment unless explicitly noted. The file is padded with `0x00` bytes to maintain `ALIGNMENT` (default: 32 bytes) boundaries between sections.

### Binary Layout (Pseudocode)

```c
struct gguf_file_t {
    gguf_header_t header;
    gguf_tensor_info_t tensor_infos[header.tensor_count];
    uint8_t _padding[];           // align to ALIGNMENT
    uint8_t tensor_data[];        // raw weight data
};
```

---

## The Header

The header is the first section of the file:

```c
struct gguf_header_t {
    uint32_t magic;           // 0x47 0x47 0x55 0x46 ("GGUF")
    uint32_t version;         // Format version (3 = current)
    uint64_t tensor_count;    // Number of tensors
    uint64_t metadata_kv_count; // Number of metadata pairs
    gguf_metadata_kv_t metadata_kv[metadata_kv_count];
};
```

### Magic Number

The magic bytes are `0x47 0x47 0x55 0x46` (ASCII: "GGUF"). In little-endian, this reads as `0x46554747`. Chac uses this magic for quick format validation:

```typescript
// Chac's GGUF validation (from src/utils/document-parser.ts)
const MAGIC = Buffer.from([0x47, 0x47, 0x55, 0x46]);
const fileMagic = buffer.subarray(0, 4);
if (!fileMagic.equals(MAGIC)) {
    throw new ValidationError("Invalid GGUF file: bad magic bytes");
}
```

### Version

Current version is **3** (introduced big-endian support). Version should only increase for structural changes — metadata-level changes update the metadata, not the version.

---

## Metadata Key-Value Pairs

GGUF uses a hierarchical key-value system for metadata. Keys must be ASCII, `lower_snake_case`, and dot-separated (e.g., `llama.context_length`).

### Required Metadata

| Key | Type | Description |
|-----|------|-------------|
| `general.architecture` | string | Model architecture (llama, qwen2, gptneox, etc.) |
| `general.quantization_version` | uint32 | Quantization format version (required if any tensors are quantized) |
| `general.alignment` | uint32 | Global alignment in bytes (must be multiple of 8, default 32) |

### General Metadata

| Key | Type | Description |
|-----|------|-------------|
| `general.name` | string | Human-readable model name |
| `general.author` | string | Model author |
| `general.version` | string | Model version |
| `general.organization` | string | Organization |
| `general.basename` | string | Base model name |
| `general.finetune` | string | Fine-tuning goal (e.g., "chat", "instruct") |
| `general.description` | string | Free-form description |
| `general.license` | string | SPDX license expression |
| `general.url` | string | Homepage URL |
| `general.size_label` | string | Size class (e.g., "8B", "70B") |
| `general.file_type` | uint32 | Majority tensor type (enum) |
| `general.tags` | string[] | Search tags |
| `general.languages` | string[] | ISO 639 language codes |
| `general.datasets` | string[] | Training dataset references |

### Architecture-Specific Metadata (LLaMA example)

| Key | Type | Description |
|-----|------|-------------|
| `llama.context_length` | uint64 | Training context length |
| `llama.embedding_length` | uint64 | Embedding dimension |
| `llama.block_count` | uint64 | Number of transformer blocks |
| `llama.feed_forward_length` | uint64 | FFN dimension |
| `llama.attention.head_count` | uint64 | Number of attention heads |
| `llama.attention.head_count_kv` | uint64 | KV heads (for GQA) |
| `llama.attention.layer_norm_rms_epsilon` | float32 | RMSNorm epsilon |
| `llama.rope.dimension_count` | uint64 | RoPE dimensions |
| `llama.rope.freq_base` | float32 | RoPE base frequency |
| `llama.expert_count` | uint32 | MoE expert count |
| `llama.expert_used_count` | uint32 | Experts used per token |

### Metadata Value Types

```c
enum gguf_metadata_value_type: uint32_t {
    UINT8    = 0,
    INT8     = 1,
    UINT16   = 2,
    INT16    = 3,
    UINT32   = 4,
    INT32    = 5,
    FLOAT32  = 6,
    BOOL     = 7,    // 0x00 = false, 0x01 = true
    STRING   = 8,    // length-prefixed UTF-8
    ARRAY    = 9,    // nested arrays supported
    UINT64   = 10,
    INT64    = 11,
    FLOAT64  = 12,
};
```

### Metadata KV Structure

```c
struct gguf_metadata_kv_t {
    gguf_string_t key;           // Hierarchical dot-separated key
    gguf_metadata_value_type value_type;
    gguf_metadata_value_t value;
};

struct gguf_string_t {
    uint64_t len;
    char string[len];            // UTF-8, NOT null-terminated
};
```

---

## Tensor Storage

After the header and metadata, each tensor is described by an info entry:

```c
struct gguf_tensor_info_t {
    gguf_string_t name;         // Max 64 bytes
    uint32_t n_dimensions;      // Currently max 4
    uint64_t dimensions[n_dimensions];
    ggml_type type;             // Weight encoding type
    uint64_t offset;            // Relative to tensor_data start
};
```

Key rules:
- Tensor names must be ≤64 bytes
- Offsets are relative to the start of `tensor_data` (not file start)
- Each offset must be a multiple of `ALIGNMENT`
- Space between tensors is padded to `ALIGNMENT` bytes

---

## Naming Convention

GGUF files follow a naming pattern for discoverability:

```
[<Sidecar>]<BaseName><SizeLabel>[-<FineTune>]-<Version>[-<Encoding>][-<Type>][-<Shard>].gguf
```

### Components

| Component | Required | Example | Description |
|-----------|----------|---------|-------------|
| Sidecar | No | `mmproj`, `mtp` | Auxiliary file loaded alongside base model |
| BaseName | Yes | `Llama-3`, `Qwen2.5` | Model architecture name |
| SizeLabel | Yes | `8B`, `70B`, `8x7B` | Parameter count with scale prefix |
| FineTune | No | `Chat`, `Instruct` | Fine-tuning goal |
| Version | Yes | `v1.0`, `v0.1` | Model version |
| Encoding | No | `Q4_K_M`, `F16`, `Q8_0` | Weight encoding scheme |
| Type | No | `LoRA`, `vocab` | File type (default = tensor model) |
| Shard | No | `00003-of-00009` | Shard position/total (5-digit padded) |

### Scale Prefixes

| Prefix | Meaning | Example |
|--------|---------|---------|
| Q | Quadrillion (10^15) | — |
| T | Trillion (10^12) | — |
| B | Billion (10^9) | 8B, 70B |
| M | Million (10^6) | 275M |
| K | Thousand (10^3) | — |

### Examples

| Filename | BaseName | Size | Version | Encoding |
|----------|----------|------|---------|----------|
| `Llama-3.1-8B-Instruct-v1.0-Q4_K_M.gguf` | Llama-3.1 | 8B | v1.0 | Q4_K_M |
| `MiniCPM5-1B-Chat-v1.0-Q4_K_M.gguf` | MiniCPM5 | 1B | v1.0 | Q4_K_M |
| `nomic-embed-text-v2-moe-Q5_K_M.gguf` | nomic-embed-text | — | — | Q5_K_M |
| `mmproj-MiniCPM-V-4.6-v1.0-F16.gguf` | MiniCPM-V-4.6 | — | v1.0 | F16 |
| `Grok-100B-v1.0-Q4_0-00003-of-00009.gguf` | Grok | 100B | v1.0 | Q4_0 (shard 3/9) |

---

## Quantization Types

GGUF supports 30+ weight encoding types defined in `ggml_type`:

### Full Precision

| Type | ID | Bits/Weight | Use Case |
|------|----|-------------|----------|
| F32 | 0 | 32 | Training, scientific computing |
| F16 | 1 | 16 | Vision encoders, high-quality storage |
| BF16 | 30 | 16 | Brain float (training stability) |
| F64 | 28 | 64 | Rarely used |

### Integer

| Type | ID | Bits/Weight | Use Case |
|------|----|-------------|----------|
| I8 | 24 | 8 | Quantized activations |
| I16 | 25 | 16 | Quantized activations |
| I32 | 26 | 32 | Quantized activations |
| I64 | 27 | 64 | Rarely used |

### Standard Quantization (Q-series)

| Type | ID | Bits/Weight | Block Size | Quality |
|------|----|-------------|------------|---------|
| Q4_0 | 2 | 4.5 | 32 | Moderate |
| Q4_1 | 3 | 5.5 | 32 | Better than Q4_0 |
| Q5_0 | 6 | 5.5 | 32 | Good |
| Q5_1 | 7 | 6.5 | 32 | Better than Q5_0 |
| Q8_0 | 8 | 8.5 | 32 | Near-FP16 |

### K-Quant (Importance-Aware)

K-quants use block-wise quantization with importance-based bit allocation. Critical layers get higher precision.

| Type | ID | Bits/Weight | Quality |
|------|----|-------------|---------|
| Q2_K | 10 | ~3.2 | Significant loss |
| Q3_K | 11 | ~3.6 | Noticeable on reasoning |
| Q4_K | 12 | ~4.9 | Best size/quality trade-off |
| Q5_K | 13 | ~5.7 | Excellent quality |
| Q6_K | 14 | ~6.6 | Near-FP16 quality |
| Q8_K | 15 | ~8.5 | Essentially lossless |

Each K-quant has S/M/L variants (Small, Medium, Large) with different bit allocations per layer.

### Importance Quantization (IQ-series)

Newer, more aggressive quantization using superblock structures:

| Type | ID | Bits/Weight | Quality |
|------|----|-------------|---------|
| IQ2_XXS | 16 | ~2.4 | Experimental |
| IQ2_XS | 17 | ~2.6 | Aggressive |
| IQ2_S | 22 | ~2.7 | Aggressive |
| IQ3_XXS | 18 | ~3.3 | Very aggressive |
| IQ3_S | 21 | ~3.7 | Aggressive |
| IQ4_NL | 20 | ~4.7 | No-lookup tables |
| IQ4_XS | 23 | ~4.5 | Efficient |
| IQ1_S | 19 | ~2.0 | Research only |
| IQ1_M | 29 | ~2.1 | Research only |

### Special Types

| Type | ID | Description |
|------|----|-------------|
| TQ1_0 | 34 | Tree quantization |
| TQ2_0 | 35 | Tree quantization (2-bit) |
| MXFP4 | 39 | Microsoft MXFP4 format (1 block) |

---

## Quantization Quality Reference

Benchmark data from llama.cpp for Llama-3.1-8B (prompt processing at 512 tokens, text generation at 128 tokens):

| Type | Size (GiB) | Bits/Weight | Prompt t/s | Gen t/s | Quality |
|------|-----------|-------------|-----------|---------|---------|
| IQ1_S | 1.87 | 2.00 | 859 | 80 | Research |
| IQ2_XXS | 2.23 | 2.38 | 852 | 80 | Experimental |
| Q2_K | 2.95 | 3.16 | 784 | 80 | Significant loss |
| Q3_K_M | 3.74 | 4.00 | 783 | 72 | Noticeable |
| Q4_K_M | 4.58 | 4.89 | 822 | 72 | **Recommended** |
| Q5_K_M | 5.33 | 5.70 | 759 | 67 | Excellent |
| Q6_K | 6.14 | 6.56 | 812 | 59 | Near-lossless |
| Q8_0 | 7.95 | 8.50 | 865 | 51 | Lossless |
| F16 | 14.96 | 16.00 | 923 | 29 | Baseline |

**Key insight**: Q4_K_M provides the best balance — 72 tok/s generation with minimal quality loss. Q8_0 has the fastest prompt processing (865 t/s) due to simpler dequantization.

---

## Tokenizer Encoding

GGUF files embed the tokenizer directly, eliminating external dependencies.

### GGML Tokenizer (Built-in)

| Key | Type | Description |
|-----|------|-------------|
| `tokenizer.ggml.model` | string | Tokenizer type: `llama` (SentencePiece), `gpt2` (BPE), `replit`, `rwkv` |
| `tokenizer.ggml.tokens` | string[] | Token vocabulary (indexed by token ID) |
| `tokenizer.ggml.scores` | float32[] | Token probabilities (optional) |
| `tokenizer.ggml.token_type` | int32[] | Token types: 1=normal, 2=unknown, 3=control, 4=user, 5=unused, 6=byte |
| `tokenizer.ggml.merges` | string[] | BPE merge rules (if applicable) |
| `tokenizer.ggml.added_tokens` | string[] | Tokens added after training |

### Special Tokens

| Key | Type | Description |
|-----|------|-------------|
| `tokenizer.ggml.bos_token_id` | uint32 | Beginning of sequence |
| `tokenizer.ggml.eos_token_id` | uint32 | End of sequence |
| `tokenizer.ggml.unknown_token_id` | uint32 | Unknown token |
| `tokenizer.ggml.separator_token_id` | uint32 | Separator |
| `tokenizer.ggml.padding_token_id` | uint32 | Padding |

### Hugging Face Tokenizer

| Key | Type | Description |
|-----|------|-------------|
| `tokenizer.huggingface.json` | string | Complete HF `tokenizer.json` content (for compatibility) |

### Chat Template

| Key | Type | Description |
|-----|------|-------------|
| `tokenizer.chat_template` | string | Jinja template for chat formatting |

---

## Tensor Naming Convention

GGUF uses standardized tensor names for transformer architectures:

### Base Layers

| Name | Description |
|------|-------------|
| `token_embd.weight` | Token embedding matrix |
| `pos_embd.weight` | Position embedding (if applicable) |
| `output_norm.weight` | Final layer normalization |
| `output.weight` | Output projection (LM head) |

### Block Layers (blk.N)

Where `N` is the block number (0-indexed):

| Name | Description |
|------|-------------|
| `blk.N.attn_norm.weight` | Attention layer norm |
| `blk.N.attn_q.weight` | Query projection |
| `blk.N.attn_k.weight` | Key projection |
| `blk.N.attn_v.weight` | Value projection |
| `blk.N.attn_output.weight` | Output projection |
| `blk.N.ffn_norm.weight` | FFN layer norm |
| `blk.N.ffn_gate.weight` | FFN gate (SwiGLU) |
| `blk.N.ffn_up.weight` | FFN up projection |
| `blk.N.ffn_down.weight` | FFN down projection |

### MoE Layers

| Name | Description |
|------|-------------|
| `blk.N.ffn_gate_inp.weight` | Expert routing |
| `blk.N.ffn_gate_exp.N.weight` | Expert gate weights |
| `blk.N.ffn_up_exp.N.weight` | Expert up weights |
| `blk.N.ffn_down_exp.N.weight` | Expert down weights |

---

## Conversion Pipeline

Converting a model to GGUF is a two-step process:

### Step 1: Convert to GGUF (F16/BF16)

```bash
# From Hugging Face (with remote download)
python convert_hf_to_gguf.py --outtype bf16 --remote user/model-name

# From local directory
python convert_hf_to_gguf.py --outtype f16 /path/to/model-dir/
```

This produces a large, full-precision GGUF file (e.g., 16GB for a 7B model).

### Step 2: Quantize

```bash
# Basic quantization
llama-quantize input-f16.gguf output-Q4_K_M.gguf Q4_K_M

# With importance matrix (recommended for quality)
llama-quantize --imatrix imatrix.gguf input-f16.gguf output-Q4_K_M.gguf Q4_K_M

# Advanced options
llama-quantize \
    --imatrix imatrix.gguf \
    --leave-output-tensor \
    --token-embedding-type q5_k \
    input-f16.gguf \
    output-Q4_K_M.gguf \
    Q4_K_M
```

### Quick Quantization from Hugging Face

```bash
# Download and quantize in one step using HF GGUF space
# Visit: https://huggingface.co/spaces/ggml-org/gguf-my-repo
```

---

## Importance Matrices (imatrix)

Importance matrices measure how much each weight contributes to model quality. They enable smarter quantization by allocating more bits to important weights.

### Why imatrix Matters

Without imatrix: all weights quantized uniformly → critical weights lose precision
With imatrix: important weights kept at higher precision → better quality at same size

### Generating an imatrix

```bash
# Generate from a calibration dataset
llama-imatrix -m model-f16.gguf -f calibration.txt -o imatrix.gguf
```

### Using an imatrix

```bash
# Quantize with imatrix guidance
llama-quantize --imatrix imatrix.gguf model-f16.gguf model-Q4_K_M.gguf Q4_K_M

# Selective weight importance
llama-quantize --imatrix imatrix.gguf \
    --include-weights attn_v \
    --include-weights ffn_down \
    model-f16.gguf model-Q4_K_M.gguf Q4_K_M
```

### Tensor-level Control

```bash
# Different quant types per tensor using regex
llama-quantize \
    --tensor-type "\.(\d*[13579])\.attn_k=q5_k" \
    --tensor-type "\.(\d*[02468])\.attn_q=q3_k" \
    model-f16.gguf model-custom.gguf Q4_K_M
```

---

## Multimodal Components (mmproj)

Models with vision/audio capabilities require a separate GGUF file for the multimodal projector.

### mmproj Structure

```
mmproj-<BaseName>-<Version>-<Encoding>.gguf
```

The mmproj file contains:
- Vision/audio encoder weights
- Projection layers (mapping visual features to LLM embedding space)
- Architecture metadata (encoder dimensions, projection dimensions)

### Why Separate Files?

- Multimodal components are **much smaller** than the LLM (typically <1GB)
- Quality impact is **high** — these prepare inputs for the LLM
- Usually kept at **high precision** (F16 or Q8_0) regardless of LLM quantization

### Chac's Vision Setup

```
usb-drive/models/
├── chat.gguf          # MiniCPM5-1B Q4_K_M (~600 MB)
├── embed.gguf         # nomic-embed-text Q5_K_M (~170 MB)
├── vision.gguf        # MiniCPM-V-4.6 mmproj F16 (~1.5 GB)
```

The vision model (`MiniCPM-V-4.6`) uses the chat model's weights plus a separate mmproj file. Chac symlinks `vision.gguf` to `chat.gguf` since they share the same base weights.

---

## Sharding for Large Models

Models too large for a single file are split into shards:

### Shard Naming

```
ModelName-Size-Version-Encoding-NNNNN-of-NNNNN.gguf
```

- `NNNNN`: 5-digit zero-padded shard number (starts at 00001)
- Total shards also 5-digit padded

### Example

```
Grok-100B-v1.0-Q4_0-00001-of-00009.gguf  (shard 1 of 9)
Grok-100B-v1.0-Q4_0-00002-of-00009.gguf  (shard 2 of 9)
...
Grok-100B-v1.0-Q4_0-00009-of-00009.gguf  (shard 9 of 9)
```

### Shard Behavior

- Each shard is a complete GGUF file with its own header, metadata, and tensors
- Tensors are distributed across shards at alignment boundaries
- Readers load all shards and treat them as one logical model
- `--keep-split` flag in llama-quantize preserves input sharding

### When to Shard

| Model Size | Shards | Reason |
|-----------|--------|--------|
| <8B | 1 | Fits in single file |
| 8B–30B | 1–2 | May split at 4GB FAT32 limit |
| 30B–70B | 2–4 | Memory/disk management |
| 70B+ | 4–12 | Required for practical distribution |

---

## Practical Guide for Chac

### Chac's Model Files

| File | Model | Quant | Size | Purpose |
|------|-------|-------|------|---------|
| `chat.gguf` | MiniCPM5-1B | Q4_K_M | ~600 MB | Chat completions |
| `embed.gguf` | nomic-embed-text-v2-moe | Q5_K_M | ~170 MB | Text embeddings |
| `vision.gguf` | MiniCPM-V-4.6 mmproj | F16 | ~1.5 GB | Image understanding |

### Validation in Chac

Chac validates GGUF files on download:

1. **Magic bytes check**: First 4 bytes must be `0x47475546`
2. **SHA256 checksum**: Verified against known-good hashes
3. **Architecture check**: `general.architecture` must be in supported list
4. **Size check**: File must match expected size range

### USB Drive Optimization

- **mmap by default**: GGUF files are mmap'd, so only accessed pages consume RAM
- **Alignment**: 32-byte alignment enables efficient page-aligned access
- **Sequential reads**: USB sequential read (200–400 MB/s) is sufficient for model loading
- **Page cache**: After first access, hot model pages stay in OS RAM

### Quantization Choice for Chac

| Use Case | Recommended | Reason |
|----------|-------------|--------|
| Chat | Q4_K_M | Best balance of size, speed, quality |
| Embeddings | Q5_K_M | Slightly higher quality for semantic search |
| Vision | F16 | Multimodal quality is input-dependent |
| Future: 3B chat | Q4_K_M or IQ4_XS | More capable, still fits in 8GB RAM |

---

## References

1. GGML Team. "GGUF Specification." https://github.com/ggml-org/ggml/blob/master/docs/gguf.md

2. GGML Team. "GGUF Format." https://github.com/ggml-org/ggml/blob/master/docs/gguf.md

3. llama.cpp. "Quantize Tool." https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md

4. llama.cpp. "Supported Models." https://github.com/ggml-org/llama.cpp

5. Hugging Face. "GGUF Editor." https://huggingface.co/spaces/CISCai/gguf-editor

6. Hugging Face. "GGUF-my-repo." https://huggingface.co/spaces/ggml-org/gguf-my-repo

7. Dettmers, T., et al. (2023). "GPTQ: Accurate Post-Training Quantization." arXiv:2210.17323.

8. Lin, J., et al. (2024). "AWQ: Activation-aware Weight Quantization." MLSys 2024. arXiv:2306.00978.

---

**See also:** [CPU+RAM Inference](./cpuram.md) · [The Karpathy Method](./Karpathy.md) · [Mixture of Experts](./MoE.md) · [DSpark Speculative Decoding](./Dspark.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)
