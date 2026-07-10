# Chac Benchmark Results

> Performance benchmarks for the Chac portable RAG chat application

## Test Environment

| Parameter | Value |
|-----------|-------|
| **Platform** | Linux x64 (Ubuntu) |
| **CPU** | x86_64 (no GPU) |
| **RAM** | System memory |
| **llama.cpp** | b9946 release |
| **Chat Model** | MiniCPM5-1B Q4_K_M (657MB) |
| **Embedding Model** | nomic-embed-text-v2-moe Q4_K_M (329MB) |
| **Binary** | Bun standalone compiled (90MB) |
| **Database** | SQLite with WAL mode |

## MTP (Multi-Token Prediction) Benchmark

### Simple Prompt: "What is the capital of France?"

| Configuration | Time | Speedup | Answer |
|---------------|------|---------|--------|
| CPU only, MTP off (default) | **16.3s** | baseline | "The capital of France is Paris." |
| CPU only, MTP on | **11.2s** | **31% faster** | "The capital of France is Paris." |

**Conclusion**: MTP speculative decoding provides a **31% latency reduction** on simple prompts by predicting multiple tokens per step.

### Complex Prompt: "Explain the difference between CPU and GPU in 3 bullet points"

| Configuration | Time | Answer Quality |
|---------------|------|----------------|
| CPU only, MTP on | **34.1s** | Detailed 3-bullet structured response with bold formatting |

**Note**: Longer output = longer generation time. Quality remains high with MTP enabled.

## LLM Status Reporting

The `/api/llm/status` endpoint reports real-time state:

```json
{
  "chat": true,
  "embed": true,
  "vision": false,
  "gpu": false,
  "mtp": true
}
```

- `gpu: true` when `llm.gpu.layers != 0`
- `mtp: true` when `llm.mtp.enabled = true`

## Settings Performance Impact

| Setting | Default | Effect |
|---------|---------|--------|
| `llm.gpu.layers` | `0` | GPU offloading (requires GPU hardware) |
| `llm.gpu.flash_attn` | `auto` | Memory-efficient attention (requires GPU) |
| `llm.gpu.split_mode` | `none` | Multi-GPU distribution strategy |
| `llm.mtp.enabled` | `false` | Speculative decoding for faster inference |
| `llm.mtp.draft_ngl` | `0` | GPU layers for draft model |

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
| Simple prompt (MTP off) | ~16s |
| Simple prompt (MTP on) | ~11s |
| Complex prompt (MTP on) | ~34s |
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

# Enable MTP
curl -X PUT http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key":"llm.mtp.enabled","value":true}'

# Enable GPU (if available)
curl -X PUT http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key":"llm.gpu.layers","value":-1}'

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

- MTP requires model support (DeepSeek-V3, MiniCPM5-1B, etc.)
- GPU acceleration requires CUDA/Vulkan/Metal-capable hardware
- Flash Attention requires GPU with sufficient VRAM
- Benchmarks run on CPU-only machine — GPU results would be significantly faster
- First inference after startup includes model loading time (~10-15s)
