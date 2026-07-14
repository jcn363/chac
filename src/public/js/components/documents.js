import { apiGet, apiPost } from "../lib/api.js";
import { escapeHtml, showToast, toggleEmptyState } from "../lib/dom.js";

export function initDocuments() {
  document.getElementById("ingest-btn")?.addEventListener("click", ingestDocument);
  document.getElementById("ingest-url-btn")?.addEventListener("click", ingestFromUrl);
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
            <div class="doc-item-header">
              <strong>${escapeHtml(d.title)}</strong>
              <div class="doc-badges">
                <span class="doc-badge">${escapeHtml(d.source_type || "file")}</span>
                ${d.description ? `<span class="doc-badge doc-badge-info" title="${escapeHtml(d.description)}">has description</span>` : ""}
                ${d.transcription ? `<span class="doc-badge doc-badge-success">has transcription</span>` : ""}
              </div>
            </div>
            ${d.description ? `<div class="doc-item-desc">${escapeHtml(d.description)}</div>` : ""}
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

async function ingestFromUrl() {
  const btn = document.getElementById("ingest-url-btn");
  const url = prompt("Enter URL to ingest:");
  if (!url) return;
  btn.disabled = true;
  btn.textContent = "Adding...";
  try {
    await apiPost("/api/documents", { url });
    loadDocuments();
    showToast("Document added from URL", "success");
  } catch {
    showToast("Failed to add document from URL");
  } finally {
    btn.disabled = false;
    btn.textContent = "+ Add from URL";
  }
}
