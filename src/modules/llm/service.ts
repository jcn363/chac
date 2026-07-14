import type { Kernel } from "../../kernel/types";
import type { LlmInstance, LlmService, ChatCompletionOptions, EmbeddingOptions, EmbeddingResponse, ModelCapabilities } from "./types";
import type { SettingsServiceType } from "../settings/types";
import { ExternalServiceError, NotFoundError, ValidationError } from "../../errors";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getAppRoot } from "../../platform/paths";
import { detectPlatform } from "../../platform/detect";
import { embeddingCache } from "../../utils/cache";
import { createLogger } from "../../utils/logger";

const log = createLogger("llm");

const BASE_PORT = 8080;

function isLlamaCppAvailable(): boolean {
  const platform = detectPlatform();
  const ext = platform.os === "windows" ? ".exe" : "";
  const binaryPath = join(getAppRoot(), "bin", "llama.cpp", "llama-server", platform.platformKey, `llama-server${ext}`);
  return existsSync(binaryPath);
}

/** Manages llama.cpp subprocesses for chat, embedding, and vision inference. */
export class LlmServiceImpl implements LlmService {
  private instances = new Map<string, LlmInstance>();
  private pendingInstances = new Map<string, Promise<string>>();
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
      log.info("Dev mode: llama.cpp not found. Using mock LLM responses.");
    }
  }

  private getUrl(id: string): string {
    const instance = this.instances.get(id);
    if (!instance) throw new NotFoundError("LLMInstance", id);
    return `http://127.0.0.1:${instance.port}`;
  }

  getModelInfo(modelType: string): ModelCapabilities | null {
    const instance = this.instances.get(modelType);
    return instance?.capabilities ?? null;
  }

  async restartInstance(modelType: string): Promise<void> {
    const instance = this.instances.get(modelType);
    if (!instance) return;

    log.info(`Restarting ${modelType} model...`);
    try {
      instance.process.kill("SIGTERM");
      for (let i = 0; i < 10; i++) {
        if (instance.process.exitCode !== null) break;
        await Bun.sleep(100);
      }
      if (instance.process.exitCode === null) {
        instance.process.kill("SIGKILL");
      }
    } catch {
      // process already dead
    }
    this.instances.delete(modelType);

    // Re-spawn on next request
    log.info(`${modelType} model stopped. Will restart on next request.`);
  }

  private async ensureInstance(id: string, modelType: "chat" | "embed" | "vision"): Promise<string> {
    if (this.devMode) return "";

    if (this.instances.has(id)) {
      return this.getUrl(id);
    }

    // Concurrency guard: if another caller is already spawning this instance, wait for it
    const pending = this.pendingInstances.get(id);
    if (pending) return pending;

    const spawnPromise = this.doSpawnInstance(id, modelType);
    this.pendingInstances.set(id, spawnPromise);
    try {
      return await spawnPromise;
    } finally {
      this.pendingInstances.delete(id);
    }
  }

  private async doSpawnInstance(id: string, modelType: "chat" | "embed" | "vision"): Promise<string> {
    const settings = this.kernel.get<SettingsServiceType>("settings");
    const ctxSize = (settings.get("llm.chat.ctx_size") as number) ?? 4096;
    const threads = (settings.get("llm.chat.threads") as number) ?? 4;
    const gpuLayers = (settings.get("llm.gpu.layers") as number) ?? 0;
    const flashAttn = (settings.get("llm.gpu.flash_attn") as string) ?? "auto";
    const splitMode = (settings.get("llm.gpu.split_mode") as string) ?? "none";
    const mtpEnabled = !!(settings.get("llm.mtp.enabled") as boolean);
    const mtpDraftNgl = (settings.get("llm.mtp.draft_ngl") as number) ?? 0;

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
    if (modelType === "vision") {
      const visionCtxSize = (settings.get("llm.vision.ctx_size") as number) ?? 4096;
      args.push("--ctx-size", String(visionCtxSize));
    }

    if (gpuLayers !== 0) {
      args.push("-ngl", String(gpuLayers));
    }
    if (flashAttn && flashAttn !== "off") {
      args.push("--flash-attn", flashAttn);
    }
    if (splitMode && splitMode !== "none") {
      args.push("--split-mode", splitMode);
    }

    if (mtpEnabled && modelType === "chat") {
      args.push("--spec-type", "draft-mtp");
      if (mtpDraftNgl > 0) {
        args.push("--spec-draft-ngl", String(mtpDraftNgl));
      }
    }

    const { resolveBinary } = await import("../../platform/binaries");
    const binaryPath = resolveBinary("llama-server");
    const subprocess = Bun.spawn([binaryPath, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const instance: LlmInstance = {
      process: subprocess,
      port,
      modelType,
      modelPath: `models/${modelType}.gguf`,
      capabilities: null,
    };
    this.instances.set(id, instance);

    try {
      await this.waitForReady(port);
      instance.capabilities = await this.queryModelInfo(port, modelType);
      this.autoDetectContext(instance);
    } catch (e) {
      subprocess.kill("SIGKILL");
      this.instances.delete(id);
      throw e;
    }
    return this.getUrl(id);
  }

  private async waitForReady(port: number, timeout = 30000): Promise<void> {
    const start = Date.now();
    let delay = 200;
    while (Date.now() - start < timeout) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) return;
      } catch {
        // not ready yet
      }
      await Bun.sleep(delay);
      delay = Math.min(delay * 1.5, 2000);
    }
    throw new ExternalServiceError("llama", `llama.cpp on port ${port} failed to start within ${timeout}ms`);
  }

  private async queryModelInfo(port: number, modelType: string): Promise<ModelCapabilities> {
    // Try /v1/props first — it exposes n_ctx via default_generation_settings
    try {
      const propsRes = await fetch(`http://127.0.0.1:${port}/v1/props`);
      if (propsRes.ok) {
        const props = await propsRes.json() as { default_generation_settings?: { n_ctx?: number } };
        const nCtx = props.default_generation_settings?.n_ctx;
        if (nCtx && nCtx > 0) {
          // Also fetch model name from /v1/models for architecture info
          let architecture = "unknown";
          try {
            const modelsRes = await fetch(`http://127.0.0.1:${port}/v1/models`);
            if (modelsRes.ok) {
              const models = await modelsRes.json() as { data?: Array<{ id?: string }> };
              architecture = models.data?.[0]?.id ?? "unknown";
            }
          } catch {
            // ignore — architecture stays "unknown"
          }
          return { contextLength: nCtx, architecture, supportsVision: modelType === "vision" };
        }
      }
    } catch {
      // fall through to /v1/models
    }

    // Fallback: /v1/models only gives us the model name, not context length
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/models`);
      if (!res.ok) return { contextLength: 0, architecture: "unknown", supportsVision: modelType === "vision" };
      const data = await res.json() as { data?: Array<{ id?: string; object?: string }> };
      const model = data.data?.[0];
      return {
        contextLength: 0,
        architecture: model?.id ?? "unknown",
        supportsVision: modelType === "vision",
      };
    } catch {
      return { contextLength: 0, architecture: "unknown", supportsVision: modelType === "vision" };
    }
  }

  private autoDetectContext(instance: LlmInstance): void {
    if (instance.modelType !== "chat") return;
    const settings = this.kernel.get<SettingsServiceType>("settings");
    const autoDetect = settings.get("llm.chat.ctx_size.auto") as boolean;
    if (!autoDetect) return;

    const currentCtx = settings.get("llm.chat.ctx_size") as number;
    if (currentCtx !== 4096) return;

    if (instance.capabilities && instance.capabilities.contextLength > 0) {
      settings.set("llm.chat.ctx_size", instance.capabilities.contextLength);
      log.info(`Auto-detected context size: ${instance.capabilities.contextLength}`);
    }
  }

  private async *chatCompletions(options: ChatCompletionOptions): AsyncGenerator<string> {
    if (this.devMode) {
      yield* this.mockChatCompletions(options);
      return;
    }

    const url = await this.ensureInstance("chat", "chat");
    const settings = this.kernel.get<SettingsServiceType>("settings");

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
      throw new ExternalServiceError("llama", `llama.cpp error: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new ExternalServiceError("llama", "No response body from llama.cpp");
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
    if (!lastMsg) throw new ValidationError("No messages provided");
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

    const cached = embeddingCache.get(options.input);
    if (cached) {
      return { data: [{ embedding: Array.from(cached) }] };
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
      throw new ExternalServiceError("llama", `Embedding error: ${response.status}`);
    }

    const result = await response.json() as EmbeddingResponse;
    if (result.data[0]?.embedding) {
      embeddingCache.set(options.input, new Float32Array(result.data[0].embedding));
    }
    return result;
  }

  private mockEmbedding(options: EmbeddingOptions): EmbeddingResponse {
    if (!options.input || options.input.length === 0) {
      return { data: [{ embedding: new Array(768).fill(0) }] };
    }
    const embedding = new Array(768).fill(0).map((_, i) => {
      const charCode = options.input.charCodeAt(i % options.input.length) || 0;
      return (charCode / 255) * 2 - 1;
    });
    return { data: [{ embedding }] };
  }

  status(): { chat: boolean; embed: boolean; vision: boolean; gpu: boolean; mtp: boolean } {
    const settings = this.kernel.get<SettingsServiceType>("settings");
    return {
      chat: this.devMode || this.instances.has("chat"),
      embed: this.devMode || this.instances.has("embed"),
      vision: !this.devMode && this.instances.has("vision"),
      gpu: !this.devMode && (settings.get("llm.gpu.layers") as number) !== 0,
      mtp: !this.devMode && !!(settings.get("llm.mtp.enabled") as boolean),
    };
  }

  async visionDescribe(imagePath: string): Promise<string> {
    if (this.devMode) {
      return "[Image description not available - vision model not loaded]";
    }

    try {
      const url = await this.ensureInstance("vision", "vision");
      const instance = this.instances.get("vision");
      if (!instance) throw new NotFoundError("LLMInstance", "vision");

      const file = Bun.file(imagePath);
      const arrayBuffer = await file.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      const mimeType = file.type || "image/png";

      const response = await fetch(`${url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: instance.modelType,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Describe this image in detail for document indexing purposes." },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          }],
          max_tokens: 512,
        }),
      });

      if (!response.ok) {
        throw new ExternalServiceError("llama", `Vision API error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return result.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      if (e instanceof ExternalServiceError) throw e;
      throw new ExternalServiceError("vision", `Vision description failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async stop(): Promise<void> {
    const kills: Promise<void>[] = [];
    const idsToDelete: string[] = [];
    for (const [id, instance] of this.instances) {
      try {
        instance.process.kill("SIGTERM");
        kills.push(
          Bun.sleep(1000).then(() => {
            if (instance.process.exitCode === null) {
              instance.process.kill("SIGKILL");
            }
          })
        );
      } catch {
        // process already dead
      }
      idsToDelete.push(id);
    }
    await Promise.all(kills);
    for (const id of idsToDelete) this.instances.delete(id);
  }
}
