# Sakana Fugu: Multi-Agent Orchestration as a Single Model

> "One model to command them all." — Sakana AI

**See also:** [Swarm Intelligence](./Swarm.md) · [Mixture of Experts](./MoE.md) · [The Karpathy Method](./Karpathy.md) · [Sub-Quadratic Attention](./Sub-quadratic.md) · [CPU+RAM Inference](./cpuram.md) · [GGUF Format](./gguf.md) · [ObsidianSA](./ObsidianSA.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)

## Table of Contents

1. [Definition](#definition)
2. [Relevance to Chac](#relevance-to-chac)
3. [Architecture](#architecture)
4. [Foundation Research](#foundation-research)
5. [Models](#models)
6. [Benchmarks](#benchmarks)
7. [Qualitative Results](#qualitative-results)
8. [Training Paradigm](#training-paradigm)
9. [API and Integration](#api-and-integration)
10. [Pricing](#pricing)
11. [Limitations](#limitations)
12. [References](#references)

---

## Definition

**Sakana Fugu** is a family of orchestrator models developed by [Sakana AI](https://sakana.ai/) (Tokyo, Japan) that dynamically coordinates a pool of frontier LLMs to tackle complex, multi-step tasks. Rather than being a single monolithic model, Fugu is itself a trained language model that learns to understand user queries and dynamically devise agentic scaffolds — selecting, routing, and coordinating multiple specialized LLMs at inference time.

Fugu achieves frontier-level performance without depending on any single vendor's model. It ships as two variants:

- **Fugu** — balanced performance and latency for everyday use
- **Fugu Ultra** — optimized for maximum answer quality on hard, high-stakes problems

The system is accessed through an OpenAI-compatible API, making it a drop-in replacement for existing LLM integrations.

### Key Characteristics

- **Dynamic orchestration**: The coordinator model selects which LLMs to invoke per-query, not via hand-coded rules
- **Multi-turn collaboration**: Agents collaborate across turns, not just within a single forward pass
- **OpenAI-compatible API**: Chat Completions and Responses endpoints — no SDK migration required
- **Agent pool control**: Users can opt specific models/providers out of Fugu's pool (Fugu only, not Ultra)
- **No weight merging**: Agents retain their individual architectures and APIs — coordination is learned, not fused

---

## Relevance to Chac

Chac currently runs a single local LLM (llama.cpp) for both embedding and chat. Fugu's architecture points toward several future directions:

1. **Multi-model routing**: Fugu's coordinator pattern could inspire Chac's chat service to dynamically select between different local models (e.g., a small model for simple queries, a larger one for complex reasoning) based on query complexity, similar to how Fugu routes to different frontier models.

2. **Wiki synthesis enhancement**: Fugu's Conductor paper demonstrates that learned coordination strategies can outperform any individual agent. Chac's wiki compilation (`WikiCompiler`) could benefit from multi-agent synthesis where separate LLM instances independently draft, verify, and refine wiki entries.

3. **Agentic RAG**: Fugu's Thinker/Worker/Verifier role assignment pattern maps naturally to Chac's RAG pipeline — a "Thinker" could plan the retrieval strategy, "Workers" could fetch and rank results, and a "Verifier" could validate answer quality before returning to the user.

4. **Model pool diversity**: Fugu's success comes from coordinating diverse models with different specializations. Chac's embedding model (nomic-embed-text) and chat model (MiniCPM) already represent this diversity — the next step would be learned coordination between them.

---

## Architecture

Fugu's architecture has three layers:

```
┌─────────────────────────────────────────────┐
│              User Query                      │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Fugu Coordinator Model               │
│    (trained LLM that understands queries     │
│     and designs agentic scaffolds)           │
└──────────────────┬──────────────────────────┘
                   │
         ┌─────────┼─────────┐
         │         │         │
    ┌────▼───┐ ┌───▼────┐ ┌──▼─────┐
    │Thinker │ │ Worker │ │Verifier│
    │  LLM   │ │  LLM   │ │  LLM   │
    └────────┘ └────────┘ └────────┘
         │         │         │
    ┌────▼─────────▼─────────▼────┐
    │    Pool of Frontier LLMs     │
    │  (diverse, vendor-agnostic)  │
    └─────────────────────────────┘
```

### TRINITY Role System

Each turn, the coordinator assigns one of three roles to a selected LLM:

- **Thinker**: Plans the approach, breaks down the problem, identifies subtasks
- **Worker**: Executes specific tasks — code generation, data analysis, retrieval
- **Verifier**: Reviews outputs, checks correctness, catches errors

This role assignment happens turn-by-turn, enabling iterative refinement across multiple rounds.

### Conductor Communication Topology

The Conductor learns to design agent-to-agent communication patterns:

- **Who talks to whom**: Not all agents need to see all outputs — the Conductor selects communication pathways
- **What instructions to write**: Each worker LLM receives targeted, role-specific instructions
- **Recursive coordination**: The Conductor can select itself as a worker, enabling self-referential topologies for dynamic test-time scaling

---

## Foundation Research

Sakana Fugu is grounded in two ICLR 2026 papers:

### TRINITY: An Evolved LLM Coordinator

**arXiv: [2512.04695](https://arxiv.org/abs/2512.04695)**

- **Authors**: Jinglue Xu, Qi Sun, Peter Schwendeman, Stefan Nielsen, Edoardo Cetin, Yujin Tang
- **Core idea**: A lightweight coordinator (~0.6B parameters + ~10K parameter head) optimized with evolutionary strategies (specifically separable CMA-ES) to orchestrate multiple LLMs
- **Key insight**: Under high dimensionality and strict budget constraints, evolutionary strategies outperform reinforcement learning, imitation learning, and random search by exploiting block-epsilon-separability
- **Result**: 86.2% on LiveCodeBench (SOTA at time of publication)

The coordinator's hidden-state representations provide rich contextualization of inputs, enabling effective delegation without requiring the coordinator itself to perform the task.

### Learning to Orchestrate Agents in Natural Language with the Conductor

**arXiv: [2512.04388](https://arxiv.org/abs/2512.04388)**

- **Authors**: Stefan Nielsen, Edoardo Cetin, Peter Schwendeman, Qi Sun, Jinglue Xu, Yujin Tang
- **Core idea**: A 7B Conductor model trained with reinforcement learning to discover natural-language coordination strategies
- **Key insight**: By training with randomized agent pools, the Conductor adapts to arbitrary sets of open- and closed-source agents
- **Recursive topologies**: Allowing the Conductor to select itself as a worker creates recursive coordination patterns — a form of dynamic test-time scaling through online iterative adaptation

Both papers demonstrate that learned coordination can unlock performance beyond any individual LLM.

---

## Models

### Fugu

- **Role**: Balanced default for everyday coding, review, and interactive work
- **Latency**: Low — suitable for responsive applications
- **Agent pool**: Configurable — users can opt specific models/providers out via the console
- **Pricing**: Standard rate of the active underlying model (no stacking)

### Fugu Ultra

- **Role**: Maximum answer quality for complex, multi-step reasoning
- **Latency**: Higher — deeper coordination across more expert agents
- **Agent pool**: Fixed (full pool required for performance)
- **Model ID**: `fugu-ultra-20260615`

---

## Benchmarks

Performance comparison from Sakana AI's June 2026 evaluation ([technical report arXiv:2606.21228](https://arxiv.org/abs/2606.21228)):

| Benchmark | Fugu | Fugu Ultra | Opus 4.8 | Gemini 3.1 Pro | GPT 5.5 |
|-----------|------|-----------|----------|----------------|---------|
| SWE Bench Pro | 59.0 | **73.7** | 69.2 | 54.2 | 58.6 |
| TerminalBench 2.1 | 80.2 | **82.1** | 74.6 | 70.3 | 78.2 |
| LiveCodeBench | 92.9 | **93.2** | 87.8 | 88.5 | 85.3 |
| LiveCodeBench Pro | 87.8 | **90.8** | 84.8 | 82.9 | 88.4 |
| Humanity's Last Exam | 47.2 | **50.0** | 49.8 | 44.4 | 41.4 |
| CharXiv Reasoning | 85.1 | **86.6** | 84.2 | 83.3 | 84.1 |
| GPQA-Diamond | **95.5** | **95.5** | 92.0 | 94.3 | 93.6 |
| SciCode | **60.1** | 58.7 | 53.5 | 58.9 | 56.1 |
| τ³ Banking | **21.7** | 20.6 | 20.6 | 8.4 | 20.6 |
| Long Context Reasoning | **74.7** | 73.3 | 67.7 | 72.7 | 74.3 |
| MRCRv2 | 86.6 | **93.6** | 87.9 | 84.9 | 94.8 |

**Bold** = highest score per benchmark. SWE Bench Pro uses mini-swe-agent scaffolding. Baseline scores are provider-reported.

Fugu Ultra leads or ties for the lead on 9 of 11 benchmarks, outperforming all publicly accessible frontier models.

---

## Qualitative Results

Sakana AI published six qualitative case studies comparing Fugu Ultra against Gemini 3.1 Pro (high), Opus 4.8 (max), and GPT 5.5 (xhigh):

1. **AutoResearch (ML training optimization)**: Fugu Ultra autonomously ran 123 experiments over ~14 hours on a single H100 GPU, achieving the best mean bits-per-byte (0.9774 ± 0.0019), beating all three baselines.

2. **Kana letter reading order**: Fugu Ultra recovered the reading order of classical Japanese chirashigaki letters with NED 0.80, while baselines scored 0.24 or failed entirely.

3. **Rubik's Cube solver**: Fugu Ultra generated a solver that solved all 300 test cubes averaging 19.72 moves (near-optimal). Two of three baselines crashed; the third averaged 19.76 moves.

4. **CAD mechanical iris**: Fugu Ultra's generated CAD had blades rotating correctly around outer pins with proper aperture open/close. Other models showed gaps, weak linkages, or incomplete closure.

5. **Blindfold chess**: Fugu won four consecutive blindfold games against three frontier models and a 2100-Elo Stockfish engine, maintaining accuracy while opponents drifted.

6. **Time-series trading**: Over five runs of a 50-week pipeline, Fugu Ultra achieved +19.43% mean return ($11,943 from $10,000), while all baselines returned less than +15%.

---

## Training Paradigm

The Fugu technical report describes a multi-stage training approach:

1. **Large-scale fine-tuning**: The coordinator model is pre-trained on diverse orchestration examples to learn basic query understanding and delegation patterns.

2. **Evolutionary optimization**: TRINITY's separable CMA-ES evolves the coordinator's parameters under budget constraints, exploiting the block structure of the delegation problem.

3. **Reinforcement learning**: The Conductor is trained with RL to maximize end-to-end task performance, discovering coordination strategies that emerge naturally through reward maximization.

4. **Infrastructure**: Production systems for continuous model pool updates — when new frontier models are released, Sakana spends ~2 weeks training and evaluating updated Fugu models before rollout.

---

## API and Integration

### Quick Start (Codex)

```bash
curl -fsSL https://sakana.ai/fugu/install | bash
codex-fugu
```

### API Access

- **Endpoint**: OpenAI-compatible (Chat Completions + Responses)
- **Auth**: API key from [console.sakana.ai](https://console.sakana.ai)
- **Models**: `fugu` (balanced) and `fugu-ultra-20260615` (performance)
- **SDK**: Any OpenAI-compatible client works — no migration needed

### Third-Party Availability

Fugu is also available through:
- OpenRouter (`sakana/fugu-ultra`)
- Vercel AI Gateway (`fugu-ultra`)
- OpenCode (models.dev)

---

## Pricing

### Subscription Plans (monthly)

| Tier | Price | Usage Allowance |
|------|-------|----------------|
| Standard | $20/month | Baseline |
| Pro | $100/month | 10x Standard |
| Max | $200/month | 20x Standard |

All tiers include both Fugu and Fugu Ultra.

### Pay-as-you-go (Token Plan)

**Fugu**: Charged at the standard rate of the active underlying model. When multiple agents are active, a single rate applies (top-tier model, no stacking).

**Fugu Ultra** (`fugu-ultra-20260615`):

| Metric | Rate | Rate (context > 272K) |
|--------|------|----------------------|
| Input | $5/1M tokens | $10/1M tokens |
| Output | $30/1M tokens | $45/1M tokens |
| Cached input | $0.50/1M tokens | $1.00/1M tokens |

---

## Limitations

- **Not available in EU/EEA** — GDPR compliance in progress
- **Underlying model routing is opaque** — which specific models Fugu selects per query is proprietary and not exposed
- **Agent pool is fixed for Ultra** — cannot opt out of specific models/providers
- **Context length pricing tier** — costs increase above 272K tokens
- **Training data usage** — opt-out available via console, but usage data helps improve the system
- **Latency trade-off** — Fugu Ultra's deeper coordination adds response time compared to single-model calls
- **No local deployment** — cloud API only; not suitable for air-gapped or fully local RAG systems like Chac

---

## Comparison to Other Multi-Agent Systems

Fugu's approach — learning orchestration end-to-end — differs from hand-designed multi-agent frameworks:

| System | Orchestration | Coordination | Key Difference |
|--------|--------------|-------------|----------------|
| **Fugu** | Learned (evolutionary + RL) | Dynamic per-query | Coordinator is itself an LLM |
| ChatDev | Role-play scripts | Sequential waterfall | Human-designed roles and phases |
| AutoGen | Agent graphs | Conversation patterns | User specifies topology |
| CrewAI | Role assignments | Sequential/parallel | Agent definitions are static |
| LangGraph | State machines | User-defined edges | Manual graph construction |

Fugu's key insight is that coordination strategies can be *learned* rather than hand-coded. The TRINITY coordinator and Conductor discover non-obvious collaboration patterns that outperform any fixed topology.

---

## References

1. Tang, Y., Cetin, E., Xu, J., et al. (2026). "Sakana Fugu Technical Report." arXiv:2606.21228. https://arxiv.org/abs/2606.21228

2. Xu, J., Sun, Q., Schwendeman, P., Nielsen, S., Cetin, E., & Tang, Y. (2025). "TRINITY: An Evolved LLM Coordinator." ICLR 2026. arXiv:2512.04695. https://arxiv.org/abs/2512.04695

3. Nielsen, S., Cetin, E., Schwendeman, P., Sun, Q., Xu, J., & Tang, Y. (2025). "Learning to Orchestrate Agents in Natural Language with the Conductor." ICLR 2026. arXiv:2512.04388. https://arxiv.org/abs/2512.04388

4. Wu, Q., et al. (2023). "ChatDev: Communicative Agents for Software Development." arXiv:2307.07924. https://arxiv.org/abs/2307.07924

5. Wu, Q., et al. (2023). "AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation." arXiv:2308.08155. https://arxiv.org/abs/2308.08155

6. Sakana AI. "Sakana Fugu." https://sakana.ai/fugu

7. Sakana AI. "Fugu Repository." https://github.com/SakanaAI/fugu

---

**See also:** [Swarm Intelligence](./Swarm.md) · [Mixture of Experts](./MoE.md) · [The Karpathy Method](./Karpathy.md) · [Sub-Quadratic Attention](./Sub-quadratic.md) · [CPU+RAM Inference](./cpuram.md) · [GGUF Format](./gguf.md) · [ObsidianSA](./ObsidianSA.md) · [README](../README.md) · [FAQ](../FAQ.md) · [BENCHMARK](../BENCHMARK.md)
