import { apiGet, apiPut, apiDelete } from "../lib/api.js";
import { escapeHtml, showToast } from "../lib/dom.js";

export function initMemory() {
  document.getElementById("memory-add-btn")?.addEventListener("click", addMemory);
  loadMemory();
}

async function loadMemory() {
  try {
    const list = document.getElementById("memory-list");
    const empty = document.getElementById("memory-empty");
    if (!list) return;
    list.innerHTML = '<div class="loading">Loading...</div>';
    if (empty) empty.classList.add("hidden");

    const entries = await apiGet("/api/memory");

    if (entries.length === 0) {
      list.innerHTML = "";
      if (empty) empty.classList.remove("hidden");
      return;
    }

    if (empty) empty.classList.add("hidden");
    list.innerHTML = entries
      .map(
        (e) =>
          `<div class="memory-row">
            <span class="memory-category">${escapeHtml(e.category)}</span>
            <span class="memory-key">${escapeHtml(e.key)}</span>
            <span class="memory-value">${escapeHtml(e.value)}</span>
            <button class="memory-delete" data-id="${escapeHtml(e.id)}" data-tooltip="Delete">&times;</button>
          </div>`
      )
      .join("");

    list.querySelectorAll(".memory-delete").forEach((btn) => {
      btn.addEventListener("click", () => deleteMemory(btn.dataset.id));
    });
  } catch {
    showToast("Failed to load memory");
  }
}

async function addMemory() {
  const category = document.getElementById("memory-category");
  const key = document.getElementById("memory-key");
  const value = document.getElementById("memory-value");
  if (!category || !key || !value) return;

  const k = key.value.trim();
  const v = value.value.trim();
  if (!k || !v) {
    showToast("Key and value are required");
    return;
  }

  try {
    await apiPut("/api/memory", { category: category.value, key: k, value: v });
    key.value = "";
    value.value = "";
    await loadMemory();
    showToast("Memory saved", "success");
  } catch {
    showToast("Failed to save memory");
  }
}

async function deleteMemory(id) {
  try {
    await apiDelete(`/api/memory/${id}`);
    await loadMemory();
    showToast("Memory deleted", "success");
  } catch {
    showToast("Failed to delete memory");
  }
}
