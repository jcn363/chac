import { marked } from "marked";
import DOMPurify from "dompurify";
import { apiGet, apiPost } from "../lib/api.js";
import { escapeHtml, showToast, toggleEmptyState } from "../lib/dom.js";

marked.setOptions({ breaks: true, gfm: true });

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
        (p, i) =>
          `<div class="wiki-item" tabindex="0" data-index="${i}">
            <strong>${escapeHtml(p.title)}</strong>
            <div class="wiki-preview">${renderMarkdown((p.content || "").slice(0, 200))}</div>
          </div>`
      )
      .join("");

    list.querySelectorAll(".wiki-item").forEach((el) => {
      el.addEventListener("click", () => {
        const idx = parseInt(el.dataset.index, 10);
        if (idx >= 0 && idx < pages.length) showWikiPage(pages[idx]);
      });
    });
  } catch {
    showToast("Failed to load wiki");
  }
}

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text));
}

function showWikiPage(page) {
  const detail = document.getElementById("wiki-detail");
  if (!detail) return;
  detail.innerHTML = `
    <div class="wiki-detail-header">
      <h3>${escapeHtml(page.title)}</h3>
      <button class="wiki-detail-close" aria-label="Close">&times;</button>
    </div>
    <div class="wiki-detail-content">${renderMarkdown(page.content || "")}</div>
  `;
  detail.classList.remove("hidden");
  detail.querySelector(".wiki-detail-close")?.addEventListener("click", () => {
    detail.classList.add("hidden");
  });
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
