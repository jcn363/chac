import { apiGet, apiPut } from "../lib/api.js";
import { escapeHtml, showToast } from "../lib/dom.js";

const MODEL_PRESETS = {
  chat: [
    { id: "openbmb/MiniCPM5-1B", name: "MiniCPM5-1B", params: "1B", ctx: 4096, desc: "Default — fast, small" },
    { id: "Qwen/Qwen2.5-3B-Instruct", name: "Qwen2.5-3B", params: "3B", ctx: 32768, desc: "Better reasoning" },
    { id: "meta-llama/Llama-3.2-3B-Instruct", name: "Llama 3.2-3B", params: "3B", ctx: 131072, desc: "Long context" },
    { id: "mistralai/Mistral-7B-Instruct-v0.3", name: "Mistral-7B", params: "7B", ctx: 32768, desc: "Best quality at 7B" },
  ],
  embed: [
    { id: "nomic-ai/nomic-embed-text-v2-moe", name: "Nomic Embed v2 MoE", params: "137M", dims: 768, desc: "Default — fast MoE" },
    { id: "mixedbread-ai/mxbai-embed-large-v1", name: "MXBAI Embed Large", params: "335M", dims: 1024, desc: "Higher quality" },
  ],
};

const SELECT_OPTIONS = {
  "llm.chat.model": () => MODEL_PRESETS.chat.map((m) => ({ value: m.id, label: `${m.name} (${m.params}) — ${m.desc}` })),
  "llm.embed.model": () => MODEL_PRESETS.embed.map((m) => ({ value: m.id, label: `${m.name} (${m.params}) — ${m.desc}` })),
  "llm.gpu.flash_attn": () => [
    { value: "on", label: "On" },
    { value: "off", label: "Off" },
    { value: "auto", label: "Auto" },
  ],
  "rag.chunk_mode": () => [
    { value: "character", label: "Character-based" },
    { value: "semantic", label: "Semantic (sentence-aware)" },
  ],
  "llm.gpu.split_mode": () => [
    { value: "none", label: "None" },
    { value: "layer", label: "Layer" },
    { value: "row", label: "Row" },
    { value: "tensor", label: "Tensor" },
  ],
};

const SKIP_KEYS = new Set(["ui.dark_mode"]);

const SETTING_GROUPS = [
  { title: "LLM — Chat", keys: ["llm.chat.model", "llm.chat.ctx_size", "llm.chat.ctx_size.auto", "llm.chat.temperature", "llm.chat.threads"] },
  { title: "LLM — Embedding", keys: ["llm.embed.model", "llm.embed.dimensions"] },
  { title: "LLM — Vision", keys: ["llm.vision.model"] },
  { title: "LLM — GPU", keys: ["llm.gpu.layers", "llm.gpu.flash_attn", "llm.gpu.split_mode"] },
  { title: "LLM — MTP", keys: ["llm.mtp.enabled", "llm.mtp.draft_ngl"] },
  { title: "RAG", keys: ["rag.chunk_size", "rag.chunk_overlap", "rag.chunk_mode", "rag.wiki_threshold", "rag.max_chunks", "rag.max_wiki_chars", "rag.wiki_synthesis_threshold", "rag.auto_compound", "wiki.agents_enabled"] },
  { title: "Memory", keys: ["memory.enabled"] },
  { title: "Server", keys: ["server.port", "server.host"] },
];

export function initSettings() {
  loadSettings();
}

function renderSettingControl(s) {
  const key = s.key;
  const value = s.value;

  if (SKIP_KEYS.has(key)) return "";

  if (SELECT_OPTIONS[key]) {
    const options = SELECT_OPTIONS[key]();
    const selected = String(value);
    return `<select data-key="${escapeHtml(key)}">
      ${options.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === selected ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
    </select>`;
  }

  if (typeof value === "boolean") {
    return `<input type="checkbox" data-key="${escapeHtml(key)}" ${value ? "checked" : ""}>`;
  }

  if (typeof value === "number") {
    const min = key.includes("layers") || key.includes("ngl") ? 0 : undefined;
    const max = key.includes("layers") ? -1 : undefined;
    const step = key.includes("temperature") ? 0.1 : 1;
    return `<input type="number" data-key="${escapeHtml(key)}" value="${value}" step="${step}" ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""}>`;
  }

  return `<input type="text" data-key="${escapeHtml(key)}" value="${escapeHtml(String(value))}">`;
}

async function onSettingChange(el) {
  const key = el.dataset.key;
  let value;

  if (el.type === "checkbox") {
    value = el.checked;
  } else if (el.type === "number") {
    value = parseFloat(el.value);
    if (isNaN(value)) return;
  } else if (el.tagName === "SELECT") {
    value = el.value;
  } else {
    value = el.value;
  }

  await saveSetting(key, value);

  if (key === "llm.chat.model") {
    const preset = MODEL_PRESETS.chat.find((m) => m.id === value);
    if (preset) {
      await saveSetting("llm.chat.ctx_size", preset.ctx);
      const ctxInput = document.querySelector('input[data-key="llm.chat.ctx_size"]');
      if (ctxInput) ctxInput.value = String(preset.ctx);
    }
  } else if (key === "llm.embed.model") {
    const preset = MODEL_PRESETS.embed.find((m) => m.id === value);
    if (preset) {
      await saveSetting("llm.embed.dimensions", preset.dims);
      const dimInput = document.querySelector('input[data-key="llm.embed.dimensions"]');
      if (dimInput) dimInput.value = String(preset.dims);
    }
  }
}

async function saveSetting(key, value) {
  try {
    await apiPut("/api/settings", { key, value });
    showToast(`${key.split(".").pop()} saved`, "success", 1500);
  } catch {
    showToast("Failed to save setting");
  }
}

async function loadSettings() {
  try {
    const settings = await apiGet("/api/settings");
    const list = document.getElementById("settings-list");
    if (!list) return;

    const settingsMap = new Map(settings.map((s) => [s.key, s]));
    let html = "";

    for (const group of SETTING_GROUPS) {
      const groupSettings = group.keys.map((k) => settingsMap.get(k)).filter(Boolean);
      if (groupSettings.length === 0) continue;

      html += `<div class="settings-group">`;
      html += `<div class="settings-group-title">${escapeHtml(group.title)}</div>`;
      for (const s of groupSettings) {
        const control = renderSettingControl(s);
        if (!control) continue;
        html += `<div class="setting-row" data-tooltip="${escapeHtml(s.description || "")}">
          <span class="setting-key">${escapeHtml(s.key.split(".").pop())}</span>
          <span class="setting-desc">${escapeHtml(s.description || "")}</span>
          <span class="setting-control">${control}</span>
        </div>`;
      }
      html += `</div>`;
    }

    list.innerHTML = html;

    list.querySelectorAll("select, input").forEach((el) => {
      el.addEventListener("change", () => onSettingChange(el));
    });
  } catch {
    showToast("Failed to load settings");
  }
}
