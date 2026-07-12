import { apiGet, apiPost } from "../lib/api.js";
import { escapeHtml, showToast, toggleEmptyState } from "../lib/dom.js";

export function initWiki() {
  document.getElementById("compile-btn")?.addEventListener("click", compileWiki);
  loadWiki();
}

async function loadWiki() {
  try {
    const data = await apiGet("/api/wiki");
    const list = document.getElementById("wiki-list");
    const empty = document.getElementById("wiki-empty");
    if (!list) return;

    const pages = data.pages || [];
    toggleEmptyState(list, empty, pages.length > 0);

    list.innerHTML = pages
      .map(
        (p) =>
          `<div class="wiki-item" tabindex="0">
            <strong>${escapeHtml(p.title)}</strong>
            <p>${escapeHtml((p.content || "").slice(0, 200))}...</p>
          </div>`
      )
      .join("");
  } catch {
    showToast("Failed to load wiki");
  }
}

async function compileWiki() {
  const btn = document.getElementById("compile-btn");
  btn.disabled = true;
  btn.textContent = "Compiling...";
  try {
    await apiPost("/api/wiki/compile", {});
    loadWiki();
    showToast("Wiki compiled", "success");
  } catch {
    showToast("Failed to compile wiki");
  } finally {
    btn.disabled = false;
    btn.textContent = "Compile Wiki";
  }
}
