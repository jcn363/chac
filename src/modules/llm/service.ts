import type { Kernel } from "../../kernel/types";
import type { LlmInstance, LlmService, ChatCompletionOptions, EmbeddingOptions, EmbeddingResponse } from "./types";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAppRoot } from "../../platform/paths";
import { detectPlatform } from "../../platform/detect";

const BASE_PORT = 8080;

function isLlamaCppAvailable(): boolean {
  const platform = detectPlatform();
  const ext = platform.os === "windows" ? ".exe" : "";
  const binaryPath = join(getAppRoot(), "bin", "llama.cpp", "llama-server", platform.platformKey, `llama-server${ext}`);
  return existsSync(binaryPath);
}

export class LlmServiceImpl implements LlmService {
  private instances = new Map<string, LlmInstance>();
  private nextPort = BASE_PORT;
  private kernel: Kernel;
  private devMode: boolean;

  chat = {
    completions: this.chatCompletions.bind(this),
  };

  embeddings = {
    create: this.createEmbedding.bind(this),
  };

  constructor(kernel: Kernel) {
    this.kernel = kernel;
    this.devMode = !isLlamaCppAvailable();
    if (this.devMode) {
      console.log("⚠️  Dev mode: llama.cpp not found. Using mock LLM responses.");
    }
  }

  private getUrl(id: string): string {
    const instance = this.instances.get(id);
    if (!instance) throw new Error(`LLM instance "${id}" not running`);
    return `http://127.0.0.1:${instance.port}`;
  }

  private async ensureInstance(id: string, modelType: "chat" | "embed" | "vision"): Promise<string> {
    if (this.devMode) return "";

    if (this.instances.has(id)) {
      return this.getUrl(id);
    }

    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    const ctxSize = (settings.get("llm.chat.ctx_size") as number) ?? 4096;
    const threads = (settings.get("llm.chat.threads") as number) ?? 4;
    const gpuLayers = (settings.get("llm.gpu.layers") as number) ?? 0;
    const flashAttn = (settings.get("llm.gpu.flash_attn") as string) ?? "auto";
    const splitMode = (settings.get("llm.gpu.split_mode") as string) ?? "none";
    const mtpEnabled = !!(settings.get("llm.mtp.enabled") as boolean);
    const mtpDraftNgl = (settings.get("llm.mtp.draft_ngl") as number) ?? 0;
    const embedModel = (settings.get("llm.embed.model") as string) ?? "local";

    const port = this.nextPort++;
    const args = [
      "-m", `models/${modelType}.gguf`,
      "--port", String(port),
      "--host", "127.0.0.1",
    ];

    if (modelType === "embed") {
      args.push("--embedding");
    }
    if (modelType === "chat") {
      args.push("--ctx-size", String(ctxSize));
      args.push("--threads", String(threads));
    }

    // GPU acceleration
    if (gpuLayers !== 0) {
      args.push("-ngl", String(gpuLayers));
    }
    if (flashAttn && flashAttn !== "auto") {
      args.push("--flash-attn", flashAttn);
    } else if (flashAttn === "auto") {
      args.push("--flash-attn", "auto");
    }
    if (splitMode && splitMode !== "none") {
      args.push("--split-mode", splitMode);
    }

    // MTP speculative decoding
    if (mtpEnabled && modelType === "chat") {
      args.push("--spec-type", "draft-mtp");
      if (mtpDraftNgl > 0) {
        args.push("--spec-draft-ngl", String(mtpDraftNgl));
      }
    }

    const { resolveBinary } = await import("../../platform/binaries");
    const binaryPath = resolveBinary("llama-server");
    const process = Bun.spawn([binaryPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    this.instances.set(id, { process, port, modelType, modelPath: `models/${modelType}.gguf` });

    await this.waitForReady(port);
    return this.getUrl(id);
  }

  private async waitForReady(port: number, timeout = 30000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) return;
      } catch {
        // not ready yet
      }
      await Bun.sleep(100);
    }
    throw new Error(`llama.cpp on port ${port} failed to start within ${timeout}ms`);
  }

  private async *chatCompletions(options: ChatCompletionOptions): AsyncGenerator<string> {
    if (this.devMode) {
      yield* this.mockChatCompletions(options);
      return;
    }

    const url = await this.ensureInstance("chat", "chat");
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");

    const response = await fetch(`${url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "local",
        messages: options.messages,
        stream: options.stream ?? true,
        temperature: options.temperature ?? (settings.get("llm.chat.temperature") as number ?? 0.7),
        max_tokens: options.max_tokens ?? 2048,
      }),
    });

    if (!response.ok) {
      throw new Error(`llama.cpp error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error("No response body from llama.cpp");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") return;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch {
            // skip malformed JSON
          }
        }
      }
    }
  }

  private async *mockChatCompletions(options: ChatCompletionOptions): AsyncGenerator<string> {
    const lastMsg = options.messages[options.messages.length - 1];
    const response = `[Dev Mode] This is a mock response to: "${lastMsg.content}". ` +
      `In production, this would be answered by llama.cpp running locally.`;
    const words = response.split(" ");
    for (const word of words) {
      yield word + " ";
      await Bun.sleep(20);
    }
  }

  private async createEmbedding(options: EmbeddingOptions): Promise<EmbeddingResponse> {
    if (this.devMode) {
      return this.mockEmbedding(options);
    }

    const url = await this.ensureInstance("embed", "embed");

    const response = await fetch(`${url}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "local",
        input: options.input,
      }),
    });

    if (!response.ok) {
      throw new Error(`Embedding error: ${response.status}`);
    }

    return response.json() as Promise<EmbeddingResponse>;
  }

  private mockEmbedding(options: EmbeddingOptions): EmbeddingResponse {
    // Deterministic mock embedding based on content hash
    const embedding = new Array(768).fill(0).map((_, i) => {
      const charCode = options.input.charCodeAt(i % options.input.length) || 0;
      return (charCode / 255) * 2 - 1;
    });
    return { data: [{ embedding }] };
  }

  status(): { chat: boolean; embed: boolean; vision: boolean; gpu: boolean; mtp: boolean } {
    const settings = this.kernel.get<{ get: (key: string) => unknown }>("settings");
    return {
      chat: this.devMode || this.instances.has("chat"),
      embed: this.devMode || this.instances.has("embed"),
      vision: !this.devMode && this.instances.has("vision"),
      gpu: !this.devMode && (settings.get("llm.gpu.layers") as number) !== 0,
      mtp: !this.devMode && !!(settings.get("llm.mtp.enabled") as boolean),
    };
  }

  async stop(): Promise<void> {
    for (const [id, instance] of this.instances) {
      try {
        instance.process.kill("SIGTERM");
        await Bun.sleep(1000);
        if (instance.process.exitCode === null) {
          instance.process.kill("SIGKILL");
        }
      } catch {
        // process already dead
      }
      this.instances.delete(id);
    }
  }
}
