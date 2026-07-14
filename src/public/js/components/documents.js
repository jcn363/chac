import { apiGet, apiPost, apiUpload } from "../lib/api.js";
import { escapeHtml, showToast, toggleEmptyState } from "../lib/dom.js";

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff"];
const ACCEPT_TYPES = ".pdf,.docx,.doc,.txt,.md,.html,.htm,.mp3,.wav,.flac,.ogg,.m4a,.aac,.mp4,.mkv,.avi,.mov,.webm,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.svg";

export function initDocuments() {
  document.getElementById("ingest-btn")?.addEventListener("click", openFilePicker);
  document.getElementById("ingest-url-btn")?.addEventListener("click", ingestFromUrl);

  const fileInput = document.getElementById("doc-file-input");
  if (fileInput) {
    fileInput.accept = ACCEPT_TYPES;
    fileInput.addEventListener("change", onFileSelected);
  }

  setupDragDrop();
  loadDocuments();
}

function openFilePicker() {
  document.getElementById("doc-file-input")?.click();
}

async function onFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = "";
  await uploadFile(file);
}

function setupDragDrop() {
  const list = document.getElementById("doc-list");
  if (!list) return;

  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    list.classList.add("drag-over");
  });

  list.addEventListener("dragleave", () => {
    list.classList.remove("drag-over");
  });

  list.addEventListener("drop", async (e) => {
    e.preventDefault();
    list.classList.remove("drag-over");
    const files = e.dataTransfer.files;
    if (!files?.length) return;
    for (const file of files) {
      await uploadFile(file);
    }
  });
}

async function uploadFile(file) {
  const btn = document.getElementById("ingest-btn");
  btn.disabled = true;
  btn.textContent = "Uploading...";
  try {
    await apiUpload("/api/documents/upload", file);
    loadDocuments();
    showToast(`"${file.name}" added`, "success");
  } catch {
    showToast(`Failed to add "${file.name}"`);
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

async function loadDocuments(page = 1) {
  try {
    const list = document.getElementById("doc-list");
    const empty = document.getElementById("doc-empty");
    if (!list) return;
    list.innerHTML = '<div class="loading">Loading...</div>';
    if (empty) empty.classList.add("hidden");

    const data = await apiGet(`/api/documents?page=${page}`);

    const docs = data.documents || [];
    toggleEmptyState(list, empty, docs.length > 0);

    list.innerHTML = docs
      .map((d) => {
        const ext = d.title.split(".").pop()?.toLowerCase() || "";
        const isImage = IMAGE_EXTS.includes(ext);
        const mimeType = d.mime_type || "";
        const isImageMime = mimeType.startsWith("image/");
        const showThumb = isImage || isImageMime;

        return `<div class="doc-item" data-id="${d.id}" tabindex="0">
          <div class="doc-item-header">
            ${showThumb ? `<div class="doc-thumb" aria-hidden="true"></div>` : ""}
            <div class="doc-item-info">
              <strong>${escapeHtml(d.title)}</strong>
              <div class="doc-badges">
                <span class="doc-badge">${escapeHtml(d.source_type || "file")}</span>
                ${isImage || isImageMime ? `<span class="doc-badge doc-badge-warn">image</span>` : ""}
                ${d.description ? `<span class="doc-badge doc-badge-info" title="${escapeHtml(d.description)}">has description</span>` : ""}
                ${d.transcription ? `<span class="doc-badge doc-badge-success">has transcription</span>` : ""}
              </div>
            </div>
          </div>
          ${d.description ? `<div class="doc-item-desc">${escapeHtml(d.description)}</div>` : ""}
          <span class="setting-value">${d.chunk_count} chunks</span>
        </div>`;
      })
      .join("");
  } catch {
    showToast("Failed to load documents");
  }
}
