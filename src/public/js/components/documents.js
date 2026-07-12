import { apiGet, apiPost } from "../lib/api.js";
import { escapeHtml, showToast, toggleEmptyState } from "../lib/dom.js";

export function initDocuments() {
  document.getElementById("ingest-btn")?.addEventListener("click", ingestDocument);
  loadDocuments();
}

async function loadDocuments(page = 1) {
  try {
    const data = await apiGet(`/api/documents?page=${page}`);
    const list = document.getElementById("doc-list");
    const empty = document.getElementById("doc-empty");
    if (!list) return;

    const docs = data.documents || [];
    toggleEmptyState(list, empty, docs.length > 0);

    list.innerHTML = docs
      .map(
        (d) =>
          `<div class="doc-item" data-id="${d.id}" tabindex="0">
            <strong>${escapeHtml(d.title)}</strong>
            <span class="setting-value">${d.chunk_count} chunks</span>
          </div>`
      )
      .join("");
  } catch {
    showToast("Failed to load documents");
  }
}

async function ingestDocument() {
  const btn = document.getElementById("ingest-btn");
  const path = prompt("Enter file path:");
  if (!path) return;
  btn.disabled = true;
  btn.textContent = "Adding...";
  try {
    await apiPost("/api/documents", { path });
    loadDocuments();
    showToast("Document added", "success");
  } catch {
    showToast("Failed to add document");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Add Document";
  }
}
