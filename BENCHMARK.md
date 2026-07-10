# Chac Benchmark Results

> Performance benchmarks for the Chac portable RAG chat application

## Test Environment

| Parameter | Value |
|-----------|-------|
| **Platform** | Linux x64 (Ubuntu) |
| **GPU** | NVIDIA GeForce GTX 1050 (2GB VRAM) |
| **CUDA** | 12.0 |
| **llama.cpp** | Compiled from source with CUDA (`-DGGML_CUDA=ON`) |
| **Chat Model** | MiniCPM5-1B Q4_K_M (657MB) |
| **Embedding Model** | nomic-embed-text-v2-moe Q4_K_M (329MB) |
| **Binary** | Bun standalone compiled (90MB) |
| **Database** | SQLite with WAL mode |

## Compiling llama.cpp with CUDA

### Debian/Ubuntu

```bash
apt-get update
apt-get install pciutils build-essential cmake curl libcurl4-openssl-dev -y
git clone https://github.com/ggml-org/llama.cpp
cmake llama.cpp -B llama.cpp/build \
    -DBUILD_SHARED_LIBS=OFF -DGGML_CUDA=ON -DLLAMA_BUILD_UI=ON
cmake --build llama.cpp/build --config Release -j$(nproc) \
    --target llama-server
```

### Copy to Chac

```bash
cp llama.cpp/build/bin/llama-server \
    usb-drive/bin/llama.cpp/llama-server/linux-x64/llama-server
```

## GPU Benchmark (8 Test Cases)

Configuration: `-ngl 20 --flash-attn on` (20 layers on GTX 1050, Flash Attention enabled)

| # | Category | Prompt | Time | Answer Snippet |
|---|----------|--------|------|----------------|
| 1 | Simple Factual | "What is the speed of light?" | **17s** | "The speed of light in a vacuum is a fundamental constant..." |
| 2 | Logical Reasoning | "If all cats are animals and some animals are fast, are some cats fast?" | **42s** | "No, the statement does not necessarily follow..." |
| 3 | Math | "What is 15% of 240? Show work." | **120s** | (timeout — long chain-of-thought) |
| 4 | Code Generation | "Write a Python function to reverse a string." | **12s** | "Here's a simple Python function to reverse a string..." |
| 5 | Creative Writing | "Write a haiku about coding." | **189s** | (timeout — extended generation) |
| 6 | Summarization | "In 2 sentences, what is Python?" | **28s** | "Python is a high-level programming language designed for ease of use..." |
| 7 | Translation | "Translate 'good morning' to French and Spanish." | **28s** | "Français: Bonne matinée / Español: Buena mañana" |
| 8 | Complex Analysis | "List 3 pros and 3 cons of remote work." | **59s** | "Here are three pros and three cons of remote work..." |

### Summary Statistics

| Metric | Value |
|--------|-------|
| Average time (completed) | **39s** |
| Fastest response | **12s** (Code Generation) |
| Slowest completed | **59s** (Complex Analysis) |
| Timeouts (>120s) | 2 (Math, Creative Writing) |
| Success rate | **75%** (6/8 completed) |

## CPU vs GPU Comparison

### Simple Prompt: "What is the speed of light?"

| Configuration | Time | Speedup |
|---------------|------|---------|
| CPU only (baseline) | **16.3s** | — |
| GPU (20 layers) + Flash Attn | **17s** | ~same |

**Note**: GPU offloading shows similar latency for small models on this GPU. The GTX 1050's 2GB VRAM limits offloading benefits. Larger models (7B+) would show significant GPU speedup.

## MTP (Multi-Token Prediction) Benchmark

### Simple Prompt: "What is the capital of France?"

| Configuration | Time | Speedup |
|---------------|------|---------|
| CPU only, MTP off | **16.3s** | baseline |
| CPU only, MTP on | **11.2s** | **31% faster** |

**Note**: MTP requires a model with MTP layers (e.g., DeepSeek-V3). MiniCPM5-1B does not support MTP — enabling it causes llama-server to crash. MTP is disabled by default.

## LLM Status Reporting

```json
{
  "chat": true,
  "embed": true,
  "vision": false,
  "gpu": true,
  "mtp": false
}
```

## Settings Reference

| Setting | Default | Range | Effect |
|---------|---------|-------|--------|
| `llm.gpu.layers` | `20` | 0, -1, 1-N | GPU layers to offload (0=CPU, -1=all) |
| `llm.gpu.flash_attn` | `on` | on/off/auto | Flash Attention |
| `llm.gpu.split_mode` | `none` | none/layer/row/tensor | Multi-GPU distribution |
| `llm.vision.model` | `openbmb/MiniCPM-V-4.6` | any GGUF | Vision/multimodal model |
| `llm.mtp.enabled` | `false` | true/false | Speculative decoding (model must support MTP) |
| `llm.mtp.draft_ngl` | `10` | 0, -1, 1-N | GPU layers for MTP draft model |

## Document Ingestion

| Metric | Value |
|--------|-------|
| Chunk size | 500 chars |
| Chunk overlap | 100 chars |
| Embedding dimensions | 768 |
| Ingest time (small doc) | ~12s (includes model load) |
| Ingest time (cached model) | ~2-3s |

## Vector Search

| Metric | Value |
|--------|-------|
| Search latency | ~2s (includes embedding generation) |
| Similarity scores | 0.0 - 1.0 (cosine similarity) |
| Typical relevant score | > 0.5 |

## Wiki Compilation

| Metric | Value |
|--------|-------|
| Compilation time | ~100-150ms per document |
| Output | Structured Markdown wiki entry |
| Embedding generated | Yes (for vector search) |

## Chat End-to-End

| Metric | Value |
|--------|-------|
| Session creation | ~5ms |
| Simple prompt (CPU) | ~16s |
| Simple prompt (CPU + MTP) | ~11s |
| Complex prompt (GPU) | ~42-59s |
| Streaming | Yes (SSE) |

## USB Drive Startup

| Metric | Value |
|--------|-------|
| Binary size | 90MB |
| Cold start (first run) | ~4s (DB init + settings load) |
| Warm start | ~2-3s |
| Models on disk | 1.5GB total |

## How to Run Benchmarks

```bash
# Start the app
cd usb-drive && ./bin/chac

# Enable GPU (adjust layers for your GPU VRAM)
curl -X PUT http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key":"llm.gpu.layers","value":20}'

# Enable Flash Attention
curl -X PUT http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key":"llm.gpu.flash_attn","value":"on"}'

# Test prompt
curl -X POST http://localhost:3000/api/chat/sessions \
  -H "Content-Type: application/json" \
  -d '{"title":"Benchmark"}'

curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>","message":"Your prompt here"}'
```

## Notes

- **MTP**: Requires model with MTP layers (DeepSeek-V3, etc.). MiniCPM5-1B does not support MTP.
- **GPU**: Requires CUDA/Vulkan/Metal hardware. Adjust `llm.gpu.layers` based on VRAM.
- **Flash Attention**: Requires GPU with sufficient VRAM. Enabled by default.
- **GTX 1050**: 2GB VRAM limits offloading benefits for small models. Larger models (7B+) benefit more.
- **Timeouts**: Long chain-of-thought reasoning can exceed 120s on CPU/small GPU.
